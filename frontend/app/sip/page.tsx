"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { toast } from "sonner";
import { AppNav } from "@/components/app/app-nav";
import { PortfolioSipSection } from "@/components/dashboard/portfolio-sip-section";
import { SipPlannerPanel } from "@/components/dashboard/sip-planner-panel";
import { useAssetQuotes } from "@/hooks/use-asset-quotes";
import { useSipPlans } from "@/hooks/use-sip-plans";
import { useTraderPositions } from "@/hooks/use-qlever";
import { ASSETS } from "@/lib/assets";
import { isDeployed, suggestLiqPrice, toE8 } from "@/lib/qlever";
import type { SipPlan } from "@/hooks/use-sip-plans";

const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

export default function SipPage() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const prices = useAssetQuotes();
  const trader = useTraderPositions();
  const { plans, isLoaded, createPlan, deletePlan, togglePlan, markPlanExecuted } = useSipPlans();
  const [runningPlanId, setRunningPlanId] = useState<string | null>(null);
  const failedAt = useRef<Map<string, number>>(new Map());

  const assets = ASSETS.map((a) => ({ symbol: a.symbol, name: a.name }));

  const executePlan = useCallback(
    async (plan: SipPlan, source: "manual" | "auto") => {
      if (!isConnected || !isDeployed() || runningPlanId) return;
      const price = prices[plan.asset]?.price ?? 0;
      if (!(price > 0)) {
        if (source === "manual") toast.error(`Live price unavailable for ${plan.asset}.`);
        return;
      }
      setRunningPlanId(plan.id);
      try {
        // a DCA run is a sealed 1x long: asset, size direction and liquidation price stay encrypted
        const ok = await trader.open({
          asset: plan.asset,
          collateral: String(plan.collateralQOR),
          leverage: 1,
          isLong: true,
          liqPrice: toE8(suggestLiqPrice(price, 1, true)),
        });
        if (ok) {
          markPlanExecuted(plan.id);
          failedAt.current.delete(plan.id);
          toast.success(`${source === "auto" ? "Auto DCA" : "DCA"} run: ${plan.collateralQOR} QOR into ${plan.asset}, sealed.`);
        } else {
          failedAt.current.set(plan.id, Date.now());
        }
      } finally {
        setRunningPlanId(null);
      }
    },
    [isConnected, runningPlanId, prices, trader, markPlanExecuted]
  );

  // Due plans run while this page is open. Each run needs a wallet confirmation; a failed or rejected run backs off for 10 minutes.
  useEffect(() => {
    if (!isLoaded || !isConnected || runningPlanId || trader.tx !== "idle") return;
    const tick = () => {
      const now = Date.now();
      const due = plans
        .filter((p) => p.isActive && new Date(p.nextRunAt).getTime() <= now && now - (failedAt.current.get(p.id) ?? 0) > RETRY_AFTER_FAILURE_MS)
        .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())[0];
      if (due) void executePlan(due, "auto");
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [isLoaded, isConnected, runningPlanId, plans, executePlan, trader.tx]);

  return (
    <div className="min-h-screen bg-background pt-16">
      <AppNav />

      <div className="border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-mono mb-1">DCA / SIP plans</h1>
              <p className="text-xs font-mono text-muted-foreground">
                Recurring long exposure at fixed 1x. Each run is a sealed position: only a commitment hash goes on-chain.
              </p>
            </div>
            <Link href="/trade" className="px-4 py-2 bg-foreground text-background font-mono text-xs border border-foreground hover:bg-foreground/90 transition-colors">
              Open manual trade
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="border border-foreground/10 p-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
          Plans are saved in this browser and execute while this page is open, because each run needs your wallet to confirm and to unlock your seal keys.
          They are not run by a server. Positions settle principal-only in this MVP.
        </div>

        <PortfolioSipSection plans={plans} plansLoaded={isLoaded} prices={prices} />

        <div className="border border-foreground/10">
          <SipPlannerPanel
            selectedAsset="sAAPL"
            assets={assets}
            prices={prices}
            isConnected={isConnected}
            qorBalance={bal ? Number(bal.formatted) : 0}
            plans={plans}
            runningPlanId={runningPlanId}
            onCreatePlan={(plan) => {
              createPlan(plan);
              toast.success(`Created ${plan.frequency.toLowerCase()} DCA plan for ${plan.asset}.`);
            }}
            onDeletePlan={(id) => {
              deletePlan(id);
              toast.success("Plan deleted.");
            }}
            onTogglePlan={togglePlan}
            onRunPlanNow={(id) => {
              const plan = plans.find((p) => p.id === id);
              if (plan) void executePlan(plan, "manual");
            }}
          />
        </div>
      </div>
    </div>
  );
}
