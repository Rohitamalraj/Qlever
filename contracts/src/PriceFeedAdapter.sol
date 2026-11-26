// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceFeed} from "./IPriceFeed.sol";

/// @title PriceFeedAdapter (signed-relay fallback, multi-asset)
/// @notice Accepts a batch of real spot prices signed by a designated reporter key. The reporter service pulls
///         tokenized-stock prices from CoinGecko. A Pyth-backed implementation of IPriceFeed can replace this
///         contract without touching the vault.
contract PriceFeedAdapter is IPriceFeed {
    struct Quote {
        uint256 price;
        uint256 publishTime;
    }

    address public owner;
    address public reporter;
    uint256 public maxStaleness; // seconds

    /// @dev Per-asset high/low over fixed time buckets, so an entry price can be checked long after it happened.
    struct Range {
        uint128 lo;
        uint128 hi;
    }

    uint256 public constant BUCKET = 1800; // seconds

    mapping(bytes32 => Quote) private _quotes;
    mapping(bytes32 => mapping(uint256 => Range)) private _ranges;

    event PriceUpdated(bytes32 indexed asset, uint256 price, uint256 publishTime);
    event ReporterChanged(address reporter);

    error NotOwner();
    error BadSignature();
    error StalePrice();
    error NotNewer();
    error ZeroPrice();
    error FutureTimestamp();
    error LengthMismatch();

    constructor(address reporter_, uint256 maxStaleness_) {
        owner = msg.sender;
        reporter = reporter_;
        maxStaleness = maxStaleness_;
    }

    function setReporter(address reporter_) external {
        if (msg.sender != owner) revert NotOwner();
        reporter = reporter_;
        emit ReporterChanged(reporter_);
    }

    function setMaxStaleness(uint256 s) external {
        if (msg.sender != owner) revert NotOwner();
        maxStaleness = s;
    }

    /// @notice Digest the reporter signs (EIP-191 personal_sign over this hash).
    function digest(bytes32[] calldata assets, uint256[] calldata prices, uint256 publishTime) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), assets, prices, publishTime));
    }

    /// @notice Anyone may relay a reporter-signed batch. One signature covers every asset in the batch.
    function updatePrices(bytes32[] calldata assets, uint256[] calldata prices, uint256 publishTime, bytes calldata sig) external {
        if (assets.length != prices.length) revert LengthMismatch();
        if (publishTime > block.timestamp) revert FutureTimestamp();
        if (block.timestamp - publishTime > maxStaleness) revert StalePrice();
        if (_recover(digest(assets, prices, publishTime), sig) != reporter) revert BadSignature();
        for (uint256 i = 0; i < assets.length; i++) {
            if (prices[i] == 0) revert ZeroPrice();
            Quote storage q = _quotes[assets[i]];
            if (publishTime <= q.publishTime) revert NotNewer();
            q.price = prices[i];
            q.publishTime = publishTime;
            _record(assets[i], prices[i], publishTime);
            emit PriceUpdated(assets[i], prices[i], publishTime);
        }
    }

    /// @inheritdoc IPriceFeed
    /// @dev Reverts if the stored price is stale so liquidations never act on old data.
    function latestPrice(bytes32 asset) external view returns (uint256, uint256) {
        Quote memory q = _quotes[asset];
        if (q.price == 0 || block.timestamp - q.publishTime > maxStaleness) revert StalePrice();
        return (q.price, q.publishTime);
    }

    function _record(bytes32 asset, uint256 price, uint256 t) internal {
        Range storage r = _ranges[asset][t / BUCKET];
        uint128 p = uint128(price);
        if (r.hi == 0) {
            _ranges[asset][t / BUCKET] = Range(p, p);
        } else if (p < r.lo) {
            r.lo = p;
        } else if (p > r.hi) {
            r.hi = p;
        }
    }

    /// @inheritdoc IPriceFeed
    /// @dev Checks the bucket containing `ts` and the one before it (the price a trader saw may have been published
    ///      just before a bucket boundary).
    function priceWasNear(bytes32 asset, uint256 price, uint256 ts) external view returns (bool) {
        uint256 b = ts / BUCKET;
        Range memory cur = _ranges[asset][b];
        Range memory prev = b == 0 ? Range(0, 0) : _ranges[asset][b - 1];
        if (cur.hi == 0 && prev.hi == 0) return false;
        uint256 lo = cur.hi == 0 ? prev.lo : (prev.hi == 0 ? cur.lo : (cur.lo < prev.lo ? cur.lo : prev.lo));
        uint256 hi = cur.hi > prev.hi ? cur.hi : prev.hi;
        return price >= lo && price <= hi;
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        // reject malleable signatures
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        address a = ecrecover(ethHash, v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }
}
