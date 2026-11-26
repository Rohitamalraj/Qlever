// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal multi-asset price source consumed by QleverVault. Prices use 8 decimals.
///         Assets are identified by a bytes32 id (the ticker, e.g. bytes32("AAPL"), left-aligned).
interface IPriceFeed {
    /// @return price latest price (8 decimals)
    /// @return publishTime unix time the price was published
    function latestPrice(bytes32 asset) external view returns (uint256 price, uint256 publishTime);

    /// @notice True if `price` lies inside the range of prices this feed recorded for `asset` around time `ts`.
    ///         Lets the vault verify a sealed entry price after the fact without ever seeing it at open.
    function priceWasNear(bytes32 asset, uint256 price, uint256 ts) external view returns (bool);
}
