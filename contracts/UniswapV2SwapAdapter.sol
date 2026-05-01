// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISwapAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV2Router02 {
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function WETH() external pure returns (address);
}

contract UniswapV2SwapAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    IUniswapV2Router02 public immutable uniswapRouter;
    
    constructor(address _router) {
        require(_router != address(0), "Zero address");
        uniswapRouter = IUniswapV2Router02(_router);
    }

    function adapterVersion() external pure override returns (string memory) {
        return "Uniswap V2 Router Adapter v1.0";
    }

    function swapWdnrToPOL(
        address wDNRAddress,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver,
        bytes calldata /* extraData */
    ) external override returns (uint256) {
        // Transfer wDNR from the executor to this adapter
        IERC20(wDNRAddress).safeTransferFrom(msg.sender, address(this), amountIn);
        
        // Approve Uniswap Router
        IERC20(wDNRAddress).approve(address(uniswapRouter), amountIn);

        // Path: wDNR -> WETH -> Native ETH
        address[] memory path = new address[](2);
        path[0] = wDNRAddress;
        path[1] = uniswapRouter.WETH();

        // Execute swap
        uint256 balanceBefore = receiver.balance;
        
        uniswapRouter.swapExactTokensForETH(
            amountIn,
            minAmountOut, // Slippage protection
            path,
            receiver,
            block.timestamp + 300 // 5 minute deadline
        );

        return receiver.balance - balanceBefore;
    }
}
