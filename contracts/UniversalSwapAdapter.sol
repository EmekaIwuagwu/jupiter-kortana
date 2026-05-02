// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ISwapAdapter.sol";

/**
 * @title UniversalSwapAdapter
 * @author Project Jupiter Team
 * @notice Universal adapter that can execute calldata from any approved DEX aggregator.
 */
contract UniversalSwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    // List of approved aggregator routers (1inch, Kyber, OpenOcean, etc.)
    mapping(address => bool) public approvedRouters;
    mapping(address => bool) public approvedCallers;

    event RouterApproved(address indexed router, bool approved);
    event CallerApproved(address indexed caller, bool approved);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setRouterApproval(address router, bool approved) external onlyOwner {
        approvedRouters[router] = approved;
        emit RouterApproved(router, approved);
    }

    function setCallerApproval(address caller, bool approved) external onlyOwner {
        approvedCallers[caller] = approved;
        emit CallerApproved(caller, approved);
    }

    function swapWdnrToPOL(
        address fromToken,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        bytes calldata extraData
    ) external override returns (uint256 amountOut) {
        require(approvedCallers[msg.sender], "Caller not approved");

        // 1. Decode extraData: (targetRouter, calldata)
        (address targetRouter, bytes memory callData) = abi.decode(extraData, (address, bytes));
        require(approvedRouters[targetRouter], "Target router not authorized");

        // 2. Pull wDNR from the Bridge Executor
        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);

        // 3. Approve the aggregator router
        IERC20(fromToken).forceApprove(targetRouter, amountIn);

        // 4. Capture balance before
        uint256 balanceBefore = address(this).balance;

        // 5. Execute the search engine's route
        (bool success, bytes memory returnData) = targetRouter.call(callData);
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("DEX execution failed");
            }
        }

        // 6. Send native tokens to the recipient
        uint256 balanceAfter = address(this).balance;
        amountOut = balanceAfter - balanceBefore;

        require(amountOut >= minOut, "Slippage error: insufficient output from DEX");

        (bool sent, ) = recipient.call{value: amountOut}("");
        require(sent, "Native payout failed");

        return amountOut;
    }

    function adapterVersion() external pure override returns (string memory) {
        return "2.0.0-Universal-Aggregator";
    }

    receive() external payable {}
}
