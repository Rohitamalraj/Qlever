"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIERS, tierLabel } from "@/lib/qlever";
import { useTier } from "@/hooks/use-qlever";

const CHECKS = [
  "Your wallet is scored from its on-chain activity on QoreChain: transaction count and QOR balance.",
  "The tier oracle signs your tier and expiry, bound to your address, the chain and the TierRegistry.",
  "You submit that signature in one transaction; the registry verifies it on-chain.",
  "Only tier and expiry are stored on-chain. No personal data is collected.",
];

const STEPS = [
  { id: "scoring", label: "Score wallet" },
  { id: "claiming", label: "Confirm in wallet" },
  { id: "done", label: "Verified" },
] as const;

export function VerifyIdentityModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTier();
  const busy = t.status === "scoring" || t.status === "claiming";
  const stepIndex = STEPS.findIndex((s) => s.id === t.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg font-mono">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> Verify identity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <div className="border border-foreground/10 p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-muted-foreground">Current tier</div>
              <div>{t.tier > 0 ? `T${t.tier} · ${tierLabel(t.tier)}` : "Unverified"}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Leverage cap</div>
              <div>{t.leverageCap}x</div>
            </div>
          </div>

          <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed list-disc pl-4">
            {CHECKS.map((c) => <li key={c}>{c}</li>)}
          </ul>

          <div className="border border-foreground/10">
            <div className="px-3 py-2 text-[10px] text-muted-foreground border-b border-foreground/10">Tier eligibility</div>
            {TIERS.map((r) => (
              <div key={r.tier} className={`grid grid-cols-[2rem_1fr_auto_auto] gap-3 px-3 py-2 border-b border-foreground/10 last:border-b-0 ${t.tier === r.tier ? "bg-foreground/[0.04]" : ""}`}>
                <span className="text-muted-foreground">T{r.tier}</span>
                <span>{r.label}</span>
                <span className="text-muted-foreground">{r.rule}</span>
                <span>≤{r.cap}x</span>
              </div>
            ))}
          </div>

          {t.assessment && (
            <div className="border border-foreground/10 p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Credit score</span><span>{t.assessment.creditScore}/100 → T{t.assessment.tier}</span></div>
              <div className="flex justify-between text-[11px] text-muted-foreground"><span>Transactions</span><span>{t.assessment.scoreBreakdown.txCount} (score {t.assessment.scoreBreakdown.txScore})</span></div>
              <div className="flex justify-between text-[11px] text-muted-foreground"><span>QOR balance</span><span>{t.assessment.scoreBreakdown.nativeBalanceQor} (score {t.assessment.scoreBreakdown.balanceScore})</span></div>
            </div>
          )}

          {t.status !== "idle" && (
            <div className="flex items-center gap-2 text-[11px]">
              {STEPS.map((s, i) => (
                <span key={s.id} className={`flex items-center gap-1 ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                  {i < stepIndex || t.status === "done" ? <CheckCircle2 className="w-3 h-3" /> : i === stepIndex && busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-3 h-3" />}
                  {s.label}{i < STEPS.length - 1 ? " →" : ""}
                </span>
              ))}
            </div>
          )}
          {t.error && <div className="text-[11px] text-red-600">{t.error}</div>}

          <button
            onClick={() => (t.status === "done" ? onOpenChange(false) : void t.verify())}
            disabled={busy}
            className="w-full py-3 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.status === "done" ? "Done" : t.isVerified ? "Re-verify wallet" : "Verify wallet"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
