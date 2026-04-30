// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title WrappedDNR
 * @author Project Jupiter Team
 * @notice ERC20 representation of Kortana's native DNR token on the Polygon network.
 * @dev Controlled by PolygonBridgeExecutor via MINTER_ROLE and BURNER_ROLE. No owner.
 *
 * LIFECYCLE:
 * 1. PolygonBridgeExecutor mints wDNR to itself upon receiving cross-chain instructions.
 * 2. wDNR is swapped to POL by the executor.
 *
 * TRUST MODEL:
 * - Only the MINTER_ROLE can create new tokens.
 * - Only the BURNER_ROLE can destroy tokens (for future cross-chain release).
 * - Admin operations should be controlled by a multi-sig.
 */
contract WrappedDNR is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    constructor(address defaultAdmin) ERC20("Wrapped DNR", "wDNR") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
        emit Burned(from, amount);
    }
}
