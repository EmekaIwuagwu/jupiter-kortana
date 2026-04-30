// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title KortanaBridge
 * @author Project Jupiter Team
 * @notice Lock-and-mint bridge contract for the Kortana network. Locks DNR and emits events for the relayer.
 * @dev Replay attacks are mitigated by including block.chainid and user nonces in the transferId.
 *
 * LIFECYCLE:
 * 1. User calls bridgeAndSwapToPolygon, locking DNR in this contract.
 * 2. Contract emits BridgeInitiated.
 * 3. Off-chain relayer listens, quotes on DEX, and executes on Polygon.
 * 4. If relayer fails, user can call cancelBridge after CANCEL_DELAY to refund.
 *
 * TRUST MODEL:
 * - Admin (DEFAULT_ADMIN_ROLE): Can reclaim stuck funds and change bridge parameters. Recommended: Multi-sig.
 * - Pauser (PAUSER_ROLE): Can pause bridge in emergencies.
 * - Relayer: Trusted off-chain entity to process events. Does not have direct control of funds here, just acts on events.
 *
 * SECURITY ASSUMPTIONS:
 * - SafeERC20 correctly handles DNR token transfers.
 * - Relayer is active and correctly processing events.
 * - block.chainid cannot change dynamically in a way that allows cross-chain replay.
 */
contract KortanaBridge is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable dnrToken;

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

    constructor(address _dnrToken, address _admin) {
        require(_dnrToken != address(0), "Zero address");
        dnrToken = IERC20(_dnrToken);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        
        minAmount = 1 ether; // Default min amount
        maxAmount = 1000000 ether; // Default max amount
    }

    function bridgeAndSwap(
        uint256 dstChainId,
        uint256 amount,
        address dstUser,
        uint256 minOutNative,
        uint256 deadline
    ) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(amount >= minAmount && amount <= maxAmount, "Amount out of bounds");
        require(dstUser != address(0), "Invalid destination user");
        require(deadline > block.timestamp, "Deadline in the past");
        require(deadline <= block.timestamp + MAX_DEADLINE, "Deadline too far");

        // Generate unique transfer ID incorporating chainid and user nonce
        bytes32 transferId = keccak256(
            abi.encodePacked(
                block.chainid,
                msg.sender,
                userNonce[msg.sender]++
            )
        );

        // Record transfer
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

        // Pull funds
        dnrToken.safeTransferFrom(msg.sender, address(this), amount);

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

        dnrToken.safeTransfer(t.sender, t.amount);

        emit BridgeCancelled(transferId, t.sender, t.amount);
    }

    function reclaimStuckFunds(bytes32 transferId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Transfer storage t = transfers[transferId];
        require(t.status == TransferStatus.PENDING, "Not pending");

        t.status = TransferStatus.RECLAIMED;

        dnrToken.safeTransfer(msg.sender, t.amount);

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
