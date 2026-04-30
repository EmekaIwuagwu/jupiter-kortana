// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./WrappedDNR.sol";
import "./ISwapAdapter.sol";

/**
 * @title PolygonBridgeExecutor
 * @author Project Jupiter Team
 * @notice Executes the destination-chain (Polygon) side of the Kortana cross-chain bridge.
 * @dev Receives bridge events from relayer, mints wDNR, and executes an atomic swap to native POL.
 *
 * LIFECYCLE:
 * 1. Relayer listens to Kortana BridgeInitiated event.
 * 2. Relayer calls `executeBridgeAndSwap` on this contract with calldata for DEX aggregator.
 * 3. This contract checks replay protection and constraints.
 * 4. Mints wDNR locally.
 * 5. Calls the ISwapAdapter to swap wDNR for POL and deliver to user.
 * 5. Calls the ISwapAdapter to swap wDNR for native and deliver to user.
 *
 * TRUST MODEL:
 * - RELAYER_ROLE: Trusted to faithfully submit bridge events. Only processes what was verified on-chain.
 * - DEFAULT_ADMIN_ROLE: Can update swap adapter and emergency withdraw. Should be a Gnosis Safe.
 *
 * SECURITY ASSUMPTIONS:
 * - Replay protection (processedTransfers) prevents duplicate mints.
 * - Slippage check guarantees minimum out or gracefully fails.
 */
contract SepoliaBridgeExecutor is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable KORTANA_CHAIN_ID;

    WrappedDNR public immutable wDNR;
    ISwapAdapter public swapAdapter;

    mapping(bytes32 => bool) public processedTransfers;

    event BridgeCompleted(
        bytes32 indexed transferId,
        address indexed dstUser,
        uint256 wDNRMinted,
        uint256 polReceived,
        uint256 timestamp
    );

    event SwapAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
    event RelayerUpdated(address indexed relayer, bool authorized);

    constructor(address _wDNR, address _swapAdapter, address _admin, uint256 _kortanaChainId) {
        require(_wDNR != address(0), "Zero address");
        require(_swapAdapter != address(0), "Zero address");

        wDNR = WrappedDNR(_wDNR);
        swapAdapter = ISwapAdapter(_swapAdapter);
        KORTANA_CHAIN_ID = _kortanaChainId;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
    }

    function executeBridgeAndSwap(
        uint256 sourceChainId,
        bytes32 transferId,
        address dstUser,
        uint256 amount,
        uint256 minOutPOL,
        uint256 deadline,
        bytes calldata extraData
    ) external whenNotPaused nonReentrant onlyRole(RELAYER_ROLE) {
        require(!processedTransfers[transferId], "Transfer already processed");
        require(block.timestamp <= deadline, "Deadline expired");
        require(sourceChainId == KORTANA_CHAIN_ID, "Invalid source chain");
        require(dstUser != address(0), "Invalid destination user");
        require(amount > 0, "Amount must be > 0");

        // CEI Pattern: Update state before external calls
        processedTransfers[transferId] = true;

        // Mint wDNR to this executor contract
        wDNR.mint(address(this), amount);

        // Approve the swap adapter
        wDNR.approve(address(swapAdapter), amount);

        // Execute the swap
        uint256 amountOut = swapAdapter.swapWdnrToPOL(
            address(wDNR),
            amount,
            minOutPOL,
            dstUser,
            extraData
        );

        require(amountOut >= minOutPOL, "Slippage too high");

        emit BridgeCompleted(
            transferId,
            dstUser,
            amount,
            amountOut,
            block.timestamp
        );
    }

    /// @dev DEFAULT_ADMIN_ROLE only. Updates the swap adapter.
    /// @dev Why: Requires admin trust to change swap execution logic.
    /// TODO: Implement a timelock for this function to enhance security.
    function setSwapAdapter(address _swapAdapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_swapAdapter != address(0), "Zero address");
        emit SwapAdapterUpdated(address(swapAdapter), _swapAdapter);
        swapAdapter = ISwapAdapter(_swapAdapter);
    }

    function setRelayer(address relayer, bool authorized) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(relayer != address(0), "Zero address");
        if (authorized) {
            _grantRole(RELAYER_ROLE, relayer);
        } else {
            _revokeRole(RELAYER_ROLE, relayer);
        }
        emit RelayerUpdated(relayer, authorized);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
