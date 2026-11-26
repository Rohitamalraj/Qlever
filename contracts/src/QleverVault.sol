// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceFeed} from "./IPriceFeed.sol";
import {TierRegistry} from "./TierRegistry.sol";

/// @title QleverVault
/// @notice Confidential leveraged synthetic-stock positions. Only a commitment hash and the collateral go on-chain at
///         open; asset, entry price, leverage, direction and liquidation price are revealed (and hash-verified) only on
///         liquidate/close.
/// @dev Settlement: a closed position returns collateral plus/minus PnL, where PnL = collateral * leverage * move.
///      Losses are capped at the collateral. Profits are paid ONLY from the pool of forfeited collateral, so the vault
///      can never owe more than it holds. The entry price is sealed, so it is verified at reveal against the price range
///      the oracle recorded around the time the position opened; an unverifiable entry settles at principal.
contract QleverVault {
    struct Position {
        address owner;
        uint256 collateral;
        bytes32 commitment;
        uint64 openedAt;
        bool open;
    }

    /// @notice The sealed fields, revealed together.
    struct Reveal {
        bytes32 asset;
        uint256 entryPrice; // 8 decimals
        uint16 leverage;
        bool isLong;
        uint256 liqPrice; // 8 decimals
        bytes32 nonce;
    }

    IPriceFeed public immutable priceFeed;
    TierRegistry public immutable tiers;
    address public owner;
    address public keeper;

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;

    uint256 public totalCollateralLocked; // collateral of currently open positions
    uint256 public openPositionCount;
    uint256 public forfeitedPool; // forfeited and lost collateral; the only source of trader profits

    uint256 private _lock = 1;

    /// @dev `envelope` is the QoreSeal ML-KEM-1024 multi-recipient envelope (trader + Keeper). Emitted, not stored.
    event PositionOpened(uint256 indexed id, address indexed trader, uint256 collateral, bytes32 commitment, bytes envelope);
    event PositionLiquidated(uint256 indexed id, bytes32 asset, uint16 leverage, bool isLong, uint256 liqPrice, uint256 price, bool tierViolationOnly);
    event PositionClosed(uint256 indexed id, uint256 returned, bool forfeited);
    event KeeperChanged(address keeper);

    error NotOwner();
    error NotKeeper();
    error NotPositionOwner();
    error NoCollateral();
    error NotOpen();
    error CommitmentMismatch();
    error NotLiquidatable();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IPriceFeed feed, TierRegistry registry, address keeper_) {
        priceFeed = feed;
        tiers = registry;
        keeper = keeper_;
        owner = msg.sender;
    }

    function setKeeper(address keeper_) external {
        if (msg.sender != owner) revert NotOwner();
        keeper = keeper_;
        emit KeeperChanged(keeper_);
    }

    /// @notice commitment = keccak256(abi.encode(asset, entryPrice, leverage, isLong, liqPrice, nonce)); see {computeCommitment}.
    function openPosition(bytes32 commitment, bytes calldata envelope) external payable returns (uint256 id) {
        if (msg.value == 0) revert NoCollateral();
        id = nextPositionId++;
        positions[id] = Position(msg.sender, msg.value, commitment, uint64(block.timestamp), true);
        totalCollateralLocked += msg.value;
        openPositionCount++;
        emit PositionOpened(id, msg.sender, msg.value, commitment, envelope);
    }

    /// @notice Keeper reveals the sealed fields. Reverts unless they match the commitment AND the real price of the
    ///         committed asset has crossed the revealed liquidation price (or leverage exceeds the owner's tier cap).
    function liquidate(uint256 id, Reveal calldata r) external nonReentrant {
        if (msg.sender != keeper) revert NotKeeper();
        Position storage p = positions[id];
        if (!p.open) revert NotOpen();
        _verify(p, r);

        (uint256 price,) = priceFeed.latestPrice(r.asset);
        bool crossed = _crossed(r.isLong, r.liqPrice, price);
        bool tierViolation = r.leverage > tiers.maxLeverage(p.owner);
        if (!crossed && !tierViolation) revert NotLiquidatable();

        _forfeit(p);
        emit PositionLiquidated(id, r.asset, r.leverage, r.isLong, r.liqPrice, price, tierViolation && !crossed);
    }

    /// @notice Trader closes via the same reveal-and-verify step. A position already past its liquidation price (or
    ///         over its tier cap) cannot escape: its collateral is forfeited to the pool.
    function closePosition(uint256 id, Reveal calldata r) external nonReentrant {
        Position storage p = positions[id];
        if (!p.open) revert NotOpen();
        if (msg.sender != p.owner) revert NotPositionOwner();
        _verify(p, r);

        (uint256 price,) = priceFeed.latestPrice(r.asset);
        address trader = p.owner;
        uint256 payout;
        bool forfeit = _crossed(r.isLong, r.liqPrice, price) || r.leverage > tiers.maxLeverage(trader);
        if (forfeit) {
            _forfeit(p);
        } else {
            payout = _payout(p, r, price);
            _close(p);
        }
        if (payout > 0) {
            (bool ok,) = trader.call{value: payout}("");
            if (!ok) revert TransferFailed();
        }
        emit PositionClosed(id, payout, forfeit);
    }

    function computeCommitment(Reveal calldata r) public pure returns (bytes32) {
        return keccak256(abi.encode(r.asset, r.entryPrice, r.leverage, r.isLong, r.liqPrice, r.nonce));
    }

    /// @notice Public pool view; exposes no individual position details.
    function poolStats() external view returns (uint256 locked, uint256 openCount, uint256 forfeited) {
        return (totalCollateralLocked, openPositionCount, forfeitedPool);
    }

    /// @dev Collateral +/- PnL. Loss capped at collateral; profit capped at the forfeited pool (and debited from it).
    ///      An entry price the oracle never recorded around the open time settles at principal.
    function _payout(Position storage p, Reveal calldata r, uint256 price) internal returns (uint256) {
        uint256 collateral = p.collateral;
        if (r.entryPrice == 0 || !priceFeed.priceWasNear(r.asset, r.entryPrice, p.openedAt)) return collateral;

        bool inProfit = r.isLong ? price >= r.entryPrice : price <= r.entryPrice;
        uint256 move = price >= r.entryPrice ? price - r.entryPrice : r.entryPrice - price;
        uint256 pnl = (collateral * r.leverage * move) / r.entryPrice;

        if (inProfit) {
            uint256 profit = pnl > forfeitedPool ? forfeitedPool : pnl;
            forfeitedPool -= profit;
            return collateral + profit;
        }
        uint256 loss = pnl > collateral ? collateral : pnl;
        forfeitedPool += loss;
        return collateral - loss;
    }

    function _verify(Position storage p, Reveal calldata r) internal view {
        if (computeCommitment(r) != p.commitment) revert CommitmentMismatch();
    }

    function _crossed(bool isLong, uint256 liqPrice, uint256 price) internal pure returns (bool) {
        return isLong ? price <= liqPrice : price >= liqPrice;
    }

    function _close(Position storage p) internal {
        p.open = false;
        totalCollateralLocked -= p.collateral;
        openPositionCount--;
    }

    function _forfeit(Position storage p) internal {
        forfeitedPool += p.collateral;
        _close(p);
    }
}
