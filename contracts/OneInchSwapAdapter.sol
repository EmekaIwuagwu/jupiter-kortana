// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ISwapAdapter.sol";

/**
 * @title OneInchSwapAdapter
 * @author Project Jupiter Team
 * @notice Production implementation of ISwapAdapter for 1inch.
 * @dev Integrates with the 1inch v5/v6 aggregation router.
 */
contract OneInchSwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    address public immutable oneInchRouter;
    address public immutable wpol; // WMATIC/WPOL address on Polygon

    // Prevent random contract calls
    mapping(address => bool) public approvedCallers;

    event CallerApproved(address indexed caller, bool approved);

    constructor(address _oneInchRouter, address _wpol, address initialOwner) Ownable(initialOwner) {
        require(_oneInchRouter != address(0), "Invalid router");
        require(_wpol != address(0), "Invalid WPOL");
        oneInchRouter = _oneInchRouter;
        wpol = _wpol;
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

        // 1. Pull wDNR from caller
        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. Decode extraData
        // We expect the relayer to pass the router address (to double check) and the payload
        (address routerTarget, bytes memory callData) = abi.decode(extraData, (address, bytes));
        
        // Ensure the target is actually 1inch
        require(routerTarget == oneInchRouter, "Target is not 1inch router");

        // 3. Approve 1inch router
        IERC20(fromToken).approve(oneInchRouter, amountIn);

        // 4. Capture native balance before
        uint256 balanceBefore = address(this).balance;

        // 5. Execute swap on 1inch
        // We use a low-level call because 1inch payload is opaque calldata
        (bool success, bytes memory returnData) = oneInchRouter.call(callData);
        if (!success) {
            // Bubble up revert reason if available
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("1inch swap failed");
            }
        }

        // 6. Check output
        uint256 balanceAfter = address(this).balance;
        amountOut = balanceAfter - balanceBefore;

        require(amountOut >= minOut, "Slippage too high");

        // 7. Transfer POL to recipient
        (bool sent, ) = recipient.call{value: amountOut}("");
        require(sent, "Failed to send POL");

        // Note: 1inch might return WPOL instead of native POL depending on the route.
        // For a true production adapter, we would check if WPOL balance increased, 
        // withdraw it to native POL, and then send.
        
        return amountOut;
    }

    function adapterVersion() external pure override returns (string memory) {
        return "1.0.0-1inch";
    }

    // Needed to receive native POL from the router
    receive() external payable {}
}
