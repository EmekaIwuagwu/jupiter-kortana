// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISwapAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BridgeLiquidityAdapter
 * @notice A self-contained, decentralized liquidity pool for the Jupiter Bridge.
 * @dev Replaces third-party DEX aggregators and public routers to guarantee 100% uptime and zero API reliance.
 */
contract BridgeLiquidityAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    // Rate: How much Native ETH per 1 wDNR
    uint256 public exchangeRate; 

    constructor(uint256 _exchangeRate) {
        exchangeRate = _exchangeRate;
    }

    function adapterVersion() external pure override returns (string memory) {
        return "Bridge Liquidity Network v1.0";
    }

    // Allow the owner/deployer to fund the pool with ETH
    receive() external payable {}

    function swapWdnrToPOL(
        address wDNRAddress,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bytes calldata /* extraData */
    ) external override returns (uint256) {
        // Transfer wDNR from the executor to this bridge-owned pool
        IERC20(wDNRAddress).safeTransferFrom(msg.sender, address(this), amountIn);
        
        // Calculate output based on fixed exchange rate (Omnichain Stable Rate)
        uint256 amountOut = (amountIn * exchangeRate) / 1e18;

        require(amountOut >= minAmountOut, "Slippage too high");
        require(address(this).balance >= amountOut, "Insufficient ETH liquidity in Bridge Pool");

        // Execute swap and deliver native ETH to the user
        (bool success, ) = receiver.call{value: amountOut}("");
        require(success, "ETH transfer failed");

        return amountOut;
    }
}
