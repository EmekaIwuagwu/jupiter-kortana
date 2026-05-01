// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title KortanaSendBridge
 * @notice Simplified native-value bridge. User sends native DNR directly.
 *         Uses msg.value as the bridge amount — no redundant amount argument.
 */
contract KortanaSendBridge is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_DEADLINE = 7 days;
    uint256 public constant CANCEL_DELAY = 1 hours;

    uint256 public minAmount = 0.001 ether;
    uint256 public maxAmount = 10_000_000 ether;

    enum TransferStatus { PENDING, COMPLETED, CANCELLED }

    struct Transfer {
        address sender;
        address dstUser;
        uint256 dstChainId;
        uint256 amount;
        uint256 minOutNative;
        uint256 deadline;
        uint256 timestamp;
        TransferStatus status;
    }

    mapping(bytes32 => Transfer) public transfers;
    mapping(address => uint256) public userNonce;

    event BridgeInitiated(
        bytes32 indexed transferId,
        address indexed sender,
        address indexed dstUser,
        uint256 dstChainId,
        uint256 amount,
        uint256 minOutNative,
        uint256 deadline,
        uint256 timestamp
    );

    event BridgeCancelled(bytes32 indexed transferId, address indexed sender, uint256 refundAmount);

    constructor(address _admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    /**
     * @notice Bridge native DNR to another chain.
     *         Amount = msg.value. No separate amount arg to avoid mismatch.
     */
    function send(
        uint256 dstChainId,
        address dstUser,
        uint256 minOutNative,
        uint256 deadline
    ) external payable whenNotPaused nonReentrant {
        uint256 amount = msg.value;
        require(amount >= minAmount && amount <= maxAmount, "Amount out of range");
        require(dstUser != address(0), "Invalid destination");
        require(deadline > block.timestamp, "Deadline in past");
        require(deadline <= block.timestamp + MAX_DEADLINE, "Deadline too far");

        bytes32 transferId = keccak256(
            abi.encodePacked(block.chainid, msg.sender, userNonce[msg.sender]++)
        );

        transfers[transferId] = Transfer({
            sender: msg.sender,
            dstUser: dstUser,
            dstChainId: dstChainId,
            amount: amount,
            minOutNative: minOutNative,
            deadline: deadline,
            timestamp: block.timestamp,
            status: TransferStatus.PENDING
        });

        emit BridgeInitiated(
            transferId, msg.sender, dstUser,
            dstChainId, amount, minOutNative,
            deadline, block.timestamp
        );
    }

    function cancel(bytes32 transferId) external nonReentrant {
        Transfer storage t = transfers[transferId];
        require(t.sender == msg.sender, "Not sender");
        require(t.status == TransferStatus.PENDING, "Not pending");
        require(block.timestamp >= t.timestamp + CANCEL_DELAY, "Too early");

        t.status = TransferStatus.CANCELLED;
        (bool ok, ) = t.sender.call{value: t.amount}("");
        require(ok, "Refund failed");

        emit BridgeCancelled(transferId, t.sender, t.amount);
    }

    function setMinAmount(uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) { minAmount = v; }
    function setMaxAmount(uint256 v) external onlyRole(DEFAULT_ADMIN_ROLE) { maxAmount = v; }
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }
}
