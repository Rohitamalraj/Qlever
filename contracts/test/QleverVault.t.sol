// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QleverVault} from "../src/QleverVault.sol";
import {TierRegistry} from "../src/TierRegistry.sol";
import {PriceFeedAdapter} from "../src/PriceFeedAdapter.sol";

contract QleverVaultTest is Test {
    QleverVault vault;
    TierRegistry tiers;
    PriceFeedAdapter feed;

    uint256 reporterKey = 0xA11CE;
    address reporter;
    address keeper = address(0xBEEF);
    address trader = address(0x7EAD);

    bytes32 constant AAPL = "AAPL";
    bytes32 constant NVDA = "NVDA";
    uint16 constant LEV = 10;
    uint256 constant START = 100_000e8; // AAPL price when positions open (also the honest entry price)
    uint256 constant LIQ = 90_000e8; // long liquidates at/below 90k
    bytes32 constant NONCE = keccak256("nonce");

    function setUp() public {
        vm.warp(1_000_000);
        reporter = vm.addr(reporterKey);
        feed = new PriceFeedAdapter(reporter, 300);
        tiers = new TierRegistry();
        vault = new QleverVault(feed, tiers, keeper);
        tiers.setCap(1, 20); // test ladder: tier 1 => 20x
        tiers.setTier(trader, 1);
        vm.deal(trader, 100 ether);
        vm.deal(address(this), 100 ether);
        _setPrice(AAPL, START);
    }

    // ---------- helpers ----------

    function _sign(uint256 key, bytes32[] memory a, uint256[] memory p, uint256 t) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _ethHash(feed.digest(a, p, t)));
        return abi.encodePacked(r, s, v);
    }

    function _setPrice(bytes32 asset, uint256 price) internal {
        vm.warp(block.timestamp + 1); // each update must be strictly newer
        bytes32[] memory a = new bytes32[](1);
        uint256[] memory p = new uint256[](1);
        a[0] = asset;
        p[0] = price;
        feed.updatePrices(a, p, block.timestamp, _sign(reporterKey, a, p, block.timestamp));
    }

    function _ethHash(bytes32 h) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _rv(bytes32 asset, uint256 entry, uint16 lev, bool isLong, uint256 liq) internal pure returns (QleverVault.Reveal memory) {
        return QleverVault.Reveal(asset, entry, lev, isLong, liq, NONCE);
    }

    function _r(uint16 lev, bool isLong, uint256 liq) internal pure returns (QleverVault.Reveal memory) {
        return _rv(AAPL, START, lev, isLong, liq);
    }

    function _openWith(QleverVault.Reveal memory r, uint256 amount) internal returns (uint256 id) {
        bytes32 c = vault.computeCommitment(r);
        vm.prank(trader);
        id = vault.openPosition{value: amount}(c, hex"deadbeef");
    }

    function _open(uint16 lev, bool isLong, uint256 liq) internal returns (uint256 id) {
        return _openWith(_r(lev, isLong, liq), 1 ether);
    }

    /// seed the forfeited pool by liquidating a throwaway position
    function _seedPool(uint256 amount) internal {
        _setPrice(NVDA, 100e8);
        uint256 id = _openWith(_rv(NVDA, 100e8, 5, true, 90e8), amount);
        _setPrice(NVDA, 80e8);
        vm.prank(keeper);
        vault.liquidate(id, _rv(NVDA, 100e8, 5, true, 90e8));
    }

    // ---------- confidentiality / commitment ----------

    function test_open_storesOnlyCommitment() public {
        uint256 id = _open(LEV, true, LIQ);
        (address o, uint256 col, bytes32 c,, bool open) = vault.positions(id);
        assertEq(o, trader);
        assertEq(col, 1 ether);
        assertEq(c, vault.computeCommitment(_r(LEV, true, LIQ)));
        assertTrue(open);
        (uint256 locked, uint256 count,) = vault.poolStats();
        assertEq(locked, 1 ether);
        assertEq(count, 1);
    }

    function test_liquidate_fabricatedFieldsRevert() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 80_000e8); // genuinely below liq
        vm.prank(keeper);
        vm.expectRevert(QleverVault.CommitmentMismatch.selector);
        vault.liquidate(id, _r(LEV, true, 120_000e8)); // made-up liq price
    }

    function test_liquidate_fabricatedEntryPriceReverts() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 80_000e8);
        vm.prank(keeper);
        vm.expectRevert(QleverVault.CommitmentMismatch.selector);
        vault.liquidate(id, _rv(AAPL, 1e8, LEV, true, LIQ)); // entry is part of the commitment
    }

    // ---------- liquidation ----------

    function test_liquidate_healthyPositionReverts() public {
        uint256 id = _open(LEV, true, LIQ);
        vm.prank(keeper);
        vm.expectRevert(QleverVault.NotLiquidatable.selector);
        vault.liquidate(id, _r(LEV, true, LIQ));
    }

    function test_liquidate_longSucceedsWhenCrossed() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 89_000e8);
        vm.prank(keeper);
        vault.liquidate(id, _r(LEV, true, LIQ));
        (uint256 locked, uint256 count, uint256 forfeited) = vault.poolStats();
        assertEq(locked, 0);
        assertEq(count, 0);
        assertEq(forfeited, 1 ether);
    }

    function test_liquidate_shortSucceedsWhenCrossed() public {
        uint256 id = _openWith(_r(LEV, false, 110_000e8), 1 ether);
        _setPrice(AAPL, 111_000e8);
        vm.prank(keeper);
        vault.liquidate(id, _r(LEV, false, 110_000e8));
    }

    function test_liquidate_onlyKeeper() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 80_000e8);
        vm.expectRevert(QleverVault.NotKeeper.selector);
        vault.liquidate(id, _r(LEV, true, LIQ));
    }

    function test_liquidate_tierViolationLiquidatableWhilePriceHealthy() public {
        uint256 id = _open(50, true, LIQ); // 50x > tier-1 cap of 20x
        vm.prank(keeper);
        vault.liquidate(id, _r(50, true, LIQ));
    }

    // ---------- multi-asset ----------

    function test_assetIsPartOfTheCommitment_wrongAssetReveal_reverts() public {
        uint256 id = _open(LEV, true, LIQ); // sealed on AAPL
        _setPrice(NVDA, 1e8); // NVDA crashes; AAPL healthy
        vm.prank(keeper);
        vm.expectRevert(QleverVault.CommitmentMismatch.selector);
        vault.liquidate(id, _rv(NVDA, START, LEV, true, LIQ));
    }

    function test_positionOnOneAsset_notLiquidatedByAnotherAssetsPrice() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(NVDA, 1e8);
        vm.prank(keeper);
        vm.expectRevert(QleverVault.NotLiquidatable.selector);
        vault.liquidate(id, _r(LEV, true, LIQ));
    }

    function test_liquidatesAgainstTheCommittedAssetsPrice() public {
        QleverVault.Reveal memory r = _rv(NVDA, 150e8, LEV, true, 140e8);
        _setPrice(NVDA, 150e8);
        uint256 id = _openWith(r, 1 ether);
        vm.prank(keeper);
        vm.expectRevert(QleverVault.NotLiquidatable.selector);
        vault.liquidate(id, r);
        _setPrice(NVDA, 139e8);
        vm.prank(keeper);
        vault.liquidate(id, r);
    }

    // ---------- close / settlement ----------

    function test_close_unchangedPriceReturnsPrincipal() public {
        uint256 id = _open(LEV, true, LIQ);
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance, before + 1 ether);
        (,, uint256 forfeited) = vault.poolStats();
        assertEq(forfeited, 0);
    }

    function test_close_wrongRevealReverts() public {
        uint256 id = _open(LEV, true, LIQ);
        vm.prank(trader);
        vm.expectRevert(QleverVault.CommitmentMismatch.selector);
        vault.closePosition(id, _r(LEV, false, LIQ)); // lies about direction
    }

    function test_close_pastLiqPriceForfeits() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 85_000e8);
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance, before);
        (,, uint256 forfeited) = vault.poolStats();
        assertEq(forfeited, 1 ether);
    }

    function test_close_onlyOwner_andNoDoubleClose() public {
        uint256 id = _open(LEV, true, LIQ);
        vm.expectRevert(QleverVault.NotPositionOwner.selector);
        vault.closePosition(id, _r(LEV, true, LIQ));
        vm.startPrank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        vm.expectRevert(QleverVault.NotOpen.selector);
        vault.closePosition(id, _r(LEV, true, LIQ));
        vm.stopPrank();
    }

    function test_close_longProfit_paidFromForfeitedPool() public {
        _seedPool(5 ether);
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 101_000e8); // +1%, 10x on 1 ether => +0.1 ether
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance - before, 1.1 ether);
        (,, uint256 forfeited) = vault.poolStats();
        assertEq(forfeited, 5 ether - 0.1 ether);
    }

    function test_close_shortProfit() public {
        _seedPool(5 ether);
        uint256 id = _openWith(_r(LEV, false, 110_000e8), 1 ether);
        _setPrice(AAPL, 99_000e8); // -1% => short +0.1 ether
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, false, 110_000e8));
        assertEq(trader.balance - before, 1.1 ether);
    }

    function test_close_profitCappedAtForfeitedPool() public {
        _seedPool(0.05 ether);
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 105_000e8); // +5% x10 => +0.5 ether owed, pool only has 0.05
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance - before, 1.05 ether);
        (,, uint256 forfeited) = vault.poolStats();
        assertEq(forfeited, 0);
    }

    function test_close_noPoolMeansNoProfit_butPrincipalReturned() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 105_000e8);
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance - before, 1 ether);
    }

    function test_close_lossReducesPayoutAndGrowsPool() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 99_000e8); // -1% x10 => -0.1 ether (still above liq)
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, _r(LEV, true, LIQ));
        assertEq(trader.balance - before, 0.9 ether);
        (,, uint256 forfeited) = vault.poolStats();
        assertEq(forfeited, 0.1 ether);
    }

    function test_close_unrecordedEntryPriceSettlesAtPrincipal() public {
        _seedPool(5 ether);
        // trader seals an entry price far below anything the oracle ever recorded, hoping for a huge fake profit
        QleverVault.Reveal memory r = _rv(AAPL, 50_000e8, LEV, true, 40_000e8);
        uint256 id = _openWith(r, 1 ether);
        uint256 before = trader.balance;
        vm.prank(trader);
        vault.closePosition(id, r);
        assertEq(trader.balance - before, 1 ether); // no profit
    }

    function test_vaultStaysSolvent_afterMixedActivity() public {
        _seedPool(3 ether);
        uint256 a = _open(LEV, true, LIQ);
        uint256 b = _openWith(_r(LEV, false, 110_000e8), 2 ether);
        _setPrice(AAPL, 102_000e8);
        vm.prank(trader);
        vault.closePosition(a, _r(LEV, true, LIQ));
        _setPrice(AAPL, 103_000e8);
        vm.prank(trader);
        vault.closePosition(b, _r(LEV, false, 110_000e8));
        (uint256 locked,, uint256 forfeited) = vault.poolStats();
        assertGe(address(vault).balance, locked + forfeited);
    }

    // ---------- price feed ----------

    function test_stalePriceRevertsLiquidation() public {
        uint256 id = _open(LEV, true, LIQ);
        _setPrice(AAPL, 80_000e8);
        vm.warp(block.timestamp + 301);
        vm.prank(keeper);
        vm.expectRevert(PriceFeedAdapter.StalePrice.selector);
        vault.liquidate(id, _r(LEV, true, LIQ));
    }

    function test_feed_rejectsWrongSigner() public {
        vm.warp(block.timestamp + 1);
        bytes32[] memory a = new bytes32[](1);
        uint256[] memory p = new uint256[](1);
        a[0] = AAPL;
        p[0] = 1e8;
        bytes memory sig = _sign(0xBAD, a, p, block.timestamp);
        vm.expectRevert(PriceFeedAdapter.BadSignature.selector);
        feed.updatePrices(a, p, block.timestamp, sig);
    }

    function test_feed_rejectsOlderUpdate() public {
        bytes32[] memory a = new bytes32[](1);
        uint256[] memory p = new uint256[](1);
        a[0] = AAPL;
        p[0] = 1e8;
        uint256 t = block.timestamp - 10;
        bytes memory sig = _sign(reporterKey, a, p, t);
        vm.expectRevert(PriceFeedAdapter.NotNewer.selector);
        feed.updatePrices(a, p, t, sig);
    }

    function test_feed_batchUpdatesManyAssetsWithOneSignature() public {
        vm.warp(block.timestamp + 1);
        bytes32[] memory a = new bytes32[](2);
        uint256[] memory p = new uint256[](2);
        a[0] = AAPL;
        p[0] = 300e8;
        a[1] = NVDA;
        p[1] = 150e8;
        feed.updatePrices(a, p, block.timestamp, _sign(reporterKey, a, p, block.timestamp));
        (uint256 pa,) = feed.latestPrice(AAPL);
        (uint256 pn,) = feed.latestPrice(NVDA);
        assertEq(pa, 300e8);
        assertEq(pn, 150e8);
    }

    function test_feed_unknownAssetIsStale() public {
        vm.expectRevert(PriceFeedAdapter.StalePrice.selector);
        feed.latestPrice(bytes32("TSLA"));
    }

    function test_feed_tamperedBatchRejected() public {
        vm.warp(block.timestamp + 1);
        bytes32[] memory a = new bytes32[](1);
        uint256[] memory p = new uint256[](1);
        a[0] = AAPL;
        p[0] = 300e8;
        bytes memory sig = _sign(reporterKey, a, p, block.timestamp);
        p[0] = 1e8; // relayer swaps the price after signing
        vm.expectRevert(PriceFeedAdapter.BadSignature.selector);
        feed.updatePrices(a, p, block.timestamp, sig);
    }

    function test_feed_priceWasNear() public {
        assertTrue(feed.priceWasNear(AAPL, START, block.timestamp));
        assertFalse(feed.priceWasNear(AAPL, START + 1, block.timestamp));
        assertFalse(feed.priceWasNear(NVDA, START, block.timestamp)); // never recorded for NVDA
        assertFalse(feed.priceWasNear(AAPL, START, block.timestamp + 10 days)); // no data that far out
    }

    // ---------- tier credentials ----------

    function _claim(uint256 oracleKey, address who, uint8 tier, uint64 expiry) internal {
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(oracleKey, _ethHash(tiers.credentialDigest(who, tier, expiry)));
        vm.prank(who);
        tiers.claimTier(tier, expiry, abi.encodePacked(r, sg, v));
    }

    function test_tier_claimRaisesCap_andExpiryLowersIt() public {
        uint256 oracleKey = 0x0AC1E;
        tiers.setTierOracle(vm.addr(oracleKey));
        address fresh = address(0xF00D);
        assertEq(tiers.maxLeverage(fresh), 2);
        _claim(oracleKey, fresh, 4, uint64(block.timestamp + 1 days));
        assertEq(tiers.maxLeverage(fresh), 10);
        vm.warp(block.timestamp + 2 days);
        assertEq(tiers.maxLeverage(fresh), 2);
    }

    function test_tier_wrongSignerRejected() public {
        tiers.setTierOracle(vm.addr(0x0AC1E));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(0xBAD, _ethHash(tiers.credentialDigest(address(0xF00D), 4, uint64(block.timestamp + 1 days))));
        vm.prank(address(0xF00D));
        vm.expectRevert(TierRegistry.BadSignature.selector);
        tiers.claimTier(4, uint64(block.timestamp + 1 days), abi.encodePacked(r, sg, v));
    }

    function test_tier_credentialIsBoundToTheClaimant() public {
        uint256 oracleKey = 0x0AC1E;
        tiers.setTierOracle(vm.addr(oracleKey));
        uint64 expiry = uint64(block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(oracleKey, _ethHash(tiers.credentialDigest(address(0xF00D), 4, expiry)));
        vm.prank(address(0xBAAD)); // someone else replays it
        vm.expectRevert(TierRegistry.BadSignature.selector);
        tiers.claimTier(4, expiry, abi.encodePacked(r, sg, v));
    }

    function test_tier_cannotUpgradeTheTierInASignedCredential() public {
        uint256 oracleKey = 0x0AC1E;
        tiers.setTierOracle(vm.addr(oracleKey));
        uint64 expiry = uint64(block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(oracleKey, _ethHash(tiers.credentialDigest(address(0xF00D), 1, expiry)));
        vm.prank(address(0xF00D));
        vm.expectRevert(TierRegistry.BadSignature.selector);
        tiers.claimTier(4, expiry, abi.encodePacked(r, sg, v)); // signed for tier 1, claims tier 4
    }

    function test_tier_expiredCredentialRejected() public {
        uint256 oracleKey = 0x0AC1E;
        tiers.setTierOracle(vm.addr(oracleKey));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(oracleKey, _ethHash(tiers.credentialDigest(address(0xF00D), 2, uint64(block.timestamp))));
        vm.prank(address(0xF00D));
        vm.expectRevert(TierRegistry.Expired.selector);
        tiers.claimTier(2, uint64(block.timestamp), abi.encodePacked(r, sg, v));
    }
}
