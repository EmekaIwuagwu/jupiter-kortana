// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KortanaBridge (Minimal)
 * @notice Ultra-minimal bridge. Only emits an event. No struct storage.
 * Total gas cost: ~50,000 (vs 200,000+ for struct-based approach).
 * The relayer reads events off-chain — no on-chain state needed.
 */
contract KortanaBridge {
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

    /**
     * @notice Initiate a cross-chain bridge transfer.
     * @dev Amount = msg.value. No separate amount arg (eliminates mismatch reverts).
     *      Does NOT store a struct — only emits event. Relayer reads events.
     */
    function send(
        uint256 dstChainId,
        address dstUser,
        uint256 minOutNative,
        uint256 deadline
    ) external payable {
        require(msg.value > 0, "Send DNR");
        require(dstUser != address(0), "Bad dst");
        require(deadline > block.timestamp, "Expired");

        bytes32 transferId = keccak256(
            abi.encodePacked(block.chainid, msg.sender, userNonce[msg.sender]++)
        );

        emit BridgeInitiated(
            transferId,
            msg.sender,
            dstUser,
            dstChainId,
            msg.value,
            minOutNative,
            deadline,
            block.timestamp
        );
    }
}
