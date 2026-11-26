// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {QleverVault} from "../src/QleverVault.sol";
import {TierRegistry} from "../src/TierRegistry.sol";
import {PriceFeedAdapter} from "../src/PriceFeedAdapter.sol";

/// Required env: PRIVATE_KEY (deployer), REPORTER (price-signer address), KEEPER (keeper address),
///               TIER_ORACLE (address whose signature authorises a trader's tier credential)
/// Optional env: MAX_STALENESS (seconds, default 300)
///
/// forge script script/Deploy.s.sol --rpc-url https://evm-testnet.qore.host --broadcast --legacy
/// Note: QoreChain requires the deployer to have a registered PQC key and an open EVM window first.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address reporter = vm.envAddress("REPORTER");
        address keeper = vm.envAddress("KEEPER");
        address tierOracle = vm.envAddress("TIER_ORACLE");
        uint256 staleness = vm.envOr("MAX_STALENESS", uint256(300));

        vm.startBroadcast(pk);
        PriceFeedAdapter feed = new PriceFeedAdapter(reporter, staleness);
        TierRegistry tiers = new TierRegistry();
        tiers.setTierOracle(tierOracle);
        QleverVault vault = new QleverVault(feed, tiers, keeper);
        vm.stopBroadcast();

        console.log("PriceFeedAdapter", address(feed));
        console.log("TierRegistry   ", address(tiers));
        console.log("QleverVault    ", address(vault));
    }
}
