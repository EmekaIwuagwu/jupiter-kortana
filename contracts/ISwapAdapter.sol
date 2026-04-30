// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISwapAdapter
 * @author Project Jupiter Team
 * @notice Interface for swap adapters that bridge wDNR to native POL.
 * @dev The `extraData` parameter is intentionally unstructured bytes rather than a typed struct.
 * This ensures the bridge executor contract remains adapter-agnostic. 
 * We can upgrade to different DEX aggregators (1inch, Paraswap, LI.FI) without redeploying the executor,
 * simply by deploying a new adapter that decodes `extraData` according to its specific needs.
 */
interface ISwapAdapter {
    /// @notice Swaps wDNR to native POL/MATIC via an on-chain DEX or aggregator router.
    /// @param fromToken Address of wDNR token
    /// @param amountIn Exact amount of wDNR to swap (already approved by caller)
    /// @param minOut Minimum POL to receive — revert if not met
    /// @param recipient Address to send resulting POL to
    /// @param extraData ABI-encoded swap instructions from relayer (router address + calldata)
    /// @return amountOut Actual POL received
    function swapWdnrToPOL(
        address fromToken,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        bytes calldata extraData
    ) external returns (uint256 amountOut);

    /// @notice Returns a human-readable identifier for this adapter version
    function adapterVersion() external view returns (string memory);
}
