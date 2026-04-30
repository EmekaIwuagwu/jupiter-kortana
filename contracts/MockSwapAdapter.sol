// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ISwapAdapter.sol";

/**
 * @title MockSwapAdapter
 * @author Project Jupiter Team
 * @notice Mock implementation of ISwapAdapter for testing bridge execution.
 * @dev Simulates swapping wDNR for native POL. Demonstrates how a real adapter would be structured.
 * 
 * LIFECYCLE:
 * 1. Receives wDNR from the executor.
 * 2. Simulates DEX execution.
 * 3. Sends mocked POL to recipient.
 */
contract MockSwapAdapter is ISwapAdapter {
    
    // Whitelist of allowed routers to prevent calldata injection
    mapping(address => bool) public approvedRouters;

    constructor() {
        // Mock setup - in a real scenario, this would be 1inch/Paraswap router addresses
    }

    function swapWdnrToPOL(
        address fromToken,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        bytes calldata extraData
    ) external override returns (uint256 amountOut) {
        // Transfer wDNR from executor to this adapter
        IERC20(fromToken).transferFrom(msg.sender, address(this), amountIn);

        /// TODO: Decode extraData into router address and calldata
        // (address router, bytes memory calldata_) = abi.decode(extraData, (address, bytes));
        
        /// TODO: Validate router address against approvedRouters whitelist
        // require(approvedRouters[router], "Router not approved");

        /// TODO: Perform slippage validation before swap
        // uint256 balanceBefore = address(this).balance;

        /// TODO: Approve router to spend fromToken
        // IERC20(fromToken).approve(router, amountIn);

        /// TODO: Execute low-level call to the DEX aggregator router
        // (bool success, bytes memory result) = router.call{value: 0}(calldata_);
        // require(success, "Swap failed");

        /// TODO: Handle WPOL -> native POL unwrapping if aggregator returns WMATIC

        /// TODO: Perform slippage validation after swap
        // amountOut = address(this).balance - balanceBefore;
        // require(amountOut >= minOut, "Insufficient output");

        // --- MOCK IMPLEMENTATION ---
        // For the mock, we just transfer some preset or calculated amount of native token to the recipient.
        // Assuming this contract is funded with native POL for testing.
        amountOut = minOut > 0 ? minOut : amountIn; // Simple mock calculation
        require(address(this).balance >= amountOut, "Insufficient mock liquidity");
        
        (bool success, ) = recipient.call{value: amountOut}("");
        require(success, "Native transfer failed");
        
        return amountOut;
    }

    function adapterVersion() external pure override returns (string memory) {
        return "1.0.0-mock";
    }

    // Function to fund the mock adapter with native POL for tests
    receive() external payable {}
}
