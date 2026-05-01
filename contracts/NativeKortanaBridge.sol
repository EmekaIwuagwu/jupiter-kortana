// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract NativeKortanaBridge is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 public constant MAX_DEADLINE = 7 days;
    uint256 public constant CANCEL_DELAY = 1 hours;

    uint256 public minAmount;
    uint256 public maxAmount;

    enum TransferStatus { PENDING, COMPLETED, CANCELLED, RECLAIMED }

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
    event FundsReclaimed(bytes32 indexed transferId, address indexed admin, uint256 amount);
    event MinMaxUpdated(uint256 minAmount, uint256 maxAmount);

    constructor(address _admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        
        minAmount = 0.001 ether; 
        maxAmount = 10000000 ether; 
    }

    function bridgeAndSwap(
        uint256 dstChainId,
        uint256 amount,
        address dstUser,
        uint256 minOutNative,
        uint256 deadline
    ) external payable whenNotPaused nonReentrant {
        require(msg.value == amount, "Must send exact native DNR amount");
        require(amount >= minAmount && amount <= maxAmount, "Amount out of bounds");
        require(dstUser != address(0), "Invalid destination user");
        require(deadline > block.timestamp, "Deadline in the past");
        require(deadline <= block.timestamp + MAX_DEADLINE, "Deadline too far");

        bytes32 transferId = keccak256(
            abi.encodePacked(
                block.chainid,
                msg.sender,
                userNonce[msg.sender]++
            )
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
            transferId,
            msg.sender,
            dstUser,
            dstChainId,
            amount,
            minOutNative,
            deadline,
            block.timestamp
        );
    }

    function cancelBridge(bytes32 transferId) external nonReentrant {
        Transfer storage t = transfers[transferId];
        require(t.sender == msg.sender, "Not sender");
        require(t.status == TransferStatus.PENDING, "Not pending");
        require(block.timestamp >= t.timestamp + CANCEL_DELAY, "Cancel delay not met");

        t.status = TransferStatus.CANCELLED;

        (bool success, ) = t.sender.call{value: t.amount}("");
        require(success, "Refund failed");

        emit BridgeCancelled(transferId, t.sender, t.amount);
    }

    function reclaimStuckFunds(bytes32 transferId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Transfer storage t = transfers[transferId];
        require(t.status == TransferStatus.PENDING, "Not pending");

        t.status = TransferStatus.RECLAIMED;

        (bool success, ) = msg.sender.call{value: t.amount}("");
        require(success, "Reclaim failed");

        emit FundsReclaimed(transferId, msg.sender, t.amount);
    }

    function setMinAmount(uint256 _minAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minAmount = _minAmount;
        emit MinMaxUpdated(minAmount, maxAmount);
    }

    function setMaxAmount(uint256 _maxAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxAmount = _maxAmount;
        emit MinMaxUpdated(minAmount, maxAmount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
