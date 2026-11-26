// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TierRegistry
/// @notice Leverage caps by risk tier (Basic 2x, Accredited 5x, Premium 8x, Institutional 10x).
///         A trader proves a tier by presenting a credential signed by the tier oracle (a wallet credit score computed
///         off-chain from on-chain activity); the credential expires and the cap falls back to the unverified default.
///         Because leverage is sealed at open, the cap cannot be checked then; QleverVault enforces it at reveal time
///         (liquidate/close). A position whose revealed leverage exceeds its owner's cap is liquidatable immediately.
contract TierRegistry {
    struct Credential {
        uint8 tier;
        uint64 expiry;
    }

    address public owner;
    address public tierOracle;

    /// @notice Owner-set tier (manual override, e.g. for allow-listing). Used when no live credential exists.
    mapping(address => uint8) public tierOf;
    mapping(address => Credential) public credentialOf;
    mapping(uint8 => uint16) public maxLeverageOfTier;

    event TierSet(address indexed trader, uint8 tier);
    event CapSet(uint8 indexed tier, uint16 maxLeverage);
    event TierClaimed(address indexed trader, uint8 tier, uint64 expiry);
    event TierOracleChanged(address oracle);

    error NotOwner();
    error BadSignature();
    error BadTier();
    error Expired();

    constructor() {
        owner = msg.sender;
        maxLeverageOfTier[0] = 2; // unverified
        maxLeverageOfTier[1] = 2; // Basic
        maxLeverageOfTier[2] = 5; // Accredited Investor
        maxLeverageOfTier[3] = 8; // Premium HNW
        maxLeverageOfTier[4] = 10; // Institutional
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setTier(address trader, uint8 tier) external onlyOwner {
        tierOf[trader] = tier;
        emit TierSet(trader, tier);
    }

    function setCap(uint8 tier, uint16 maxLeverage_) external onlyOwner {
        maxLeverageOfTier[tier] = maxLeverage_;
        emit CapSet(tier, maxLeverage_);
    }

    function setTierOracle(address oracle) external onlyOwner {
        tierOracle = oracle;
        emit TierOracleChanged(oracle);
    }

    /// @notice Digest the tier oracle signs (EIP-191 personal_sign). Bound to the claimant, chain and this registry.
    function credentialDigest(address trader, uint8 tier, uint64 expiry) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), trader, tier, expiry));
    }

    /// @notice Present an oracle-signed credential for the caller. Replaces any previous credential.
    function claimTier(uint8 tier, uint64 expiry, bytes calldata sig) external {
        if (tier == 0 || tier > 4) revert BadTier();
        if (expiry <= block.timestamp) revert Expired();
        if (tierOracle == address(0) || _recover(credentialDigest(msg.sender, tier, expiry), sig) != tierOracle) revert BadSignature();
        credentialOf[msg.sender] = Credential(tier, expiry);
        emit TierClaimed(msg.sender, tier, expiry);
    }

    /// @notice The tier currently in force: a live credential, else the owner-set tier.
    function effectiveTier(address trader) public view returns (uint8) {
        Credential memory c = credentialOf[trader];
        if (c.tier != 0 && c.expiry > block.timestamp) return c.tier;
        return tierOf[trader];
    }

    function maxLeverage(address trader) external view returns (uint16) {
        return maxLeverageOfTier[effectiveTier(trader)];
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        address a = ecrecover(ethHash, v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }
}
