import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "event PositionOpened(uint256 indexed id, address indexed trader, uint256 collateral, bytes32 commitment, bytes envelope)",
  "event PositionLiquidated(uint256 indexed id, bytes32 asset, uint16 leverage, bool isLong, uint256 liqPrice, uint256 price, bool tierViolationOnly)",
  "event PositionClosed(uint256 indexed id, uint256 returned, bool forfeited)",
  "function openPosition(bytes32 commitment, bytes envelope) payable returns (uint256)",
  "function liquidate(uint256 id, (bytes32 asset, uint256 entryPrice, uint16 leverage, bool isLong, uint256 liqPrice, bytes32 nonce) r)",
  "function closePosition(uint256 id, (bytes32 asset, uint256 entryPrice, uint16 leverage, bool isLong, uint256 liqPrice, bytes32 nonce) r)",
  "function positions(uint256) view returns (address owner, uint256 collateral, bytes32 commitment, uint64 openedAt, bool open)",
  "function poolStats() view returns (uint256 locked, uint256 openCount, uint256 forfeited)",
  "function tiers() view returns (address)",
]);

export const feedAbi = parseAbi([
  "function latestPrice(bytes32 asset) view returns (uint256 price, uint256 publishTime)",
  "function digest(bytes32[] assets, uint256[] prices, uint256 publishTime) view returns (bytes32)",
  "function updatePrices(bytes32[] assets, uint256[] prices, uint256 publishTime, bytes sig)",
]);

export const tierAbi = parseAbi(["function maxLeverage(address trader) view returns (uint16)"]);
