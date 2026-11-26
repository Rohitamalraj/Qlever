"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const comparison: { field: string; you: string; chain: string }[] = [
  { field: "Asset", you: "visible", chain: "sealed" },
  { field: "Entry price", you: "visible", chain: "sealed" },
  { field: "Leverage", you: "visible", chain: "sealed" },
  { field: "Direction", you: "visible", chain: "sealed" },
  { field: "Liquidation price", you: "visible", chain: "sealed" },
  { field: "Commitment hash", you: "visible", chain: "public" },
  { field: "Collateral (QOR)", you: "visible", chain: "public" },
];

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div
          className={`relative border border-foreground/80 transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="relative z-10 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-12 lg:gap-16 px-5 sm:px-10 lg:px-16 py-14 lg:py-20">
            <div>
              <h2 className="text-4xl sm:text-5xl lg:text-7xl font-display tracking-tight mb-8 leading-[0.95]">
                Trade where bots
                <br />
                <span className="text-muted-foreground">cannot see you.</span>
              </h2>
              <p className="text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed max-w-xl">
                Open a sealed leveraged position on QoreChain, or schedule recurring buys with a DCA plan.
                Harvest-now-decrypt-later cannot expose what was never published in the clear.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-foreground hover:bg-foreground/90 text-background px-7 h-12 text-base rounded-full group"
                >
                  <Link href="/trade">
                    Launch trading app
                    <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 text-base rounded-full border-foreground/20 bg-transparent hover:bg-foreground/5"
                >
                  <Link href="/sip">Start a DCA plan</Link>
                </Button>
                <Link
                  href="/keeper"
                  className="inline-flex items-center px-2 h-12 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Keeper dashboard →
                </Link>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-8 font-mono">
                QoreChain testnet (qorechain-diana) · No mainnet funds required
              </p>
            </div>

            <div className="self-center border border-foreground/10 bg-background">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 sm:gap-x-6 px-4 sm:px-5 py-3 border-b border-foreground/10 font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>Field</span>
                <span className="w-16 text-right">You</span>
                <span className="w-16 text-right">On-chain</span>
              </div>
              {comparison.map((row, i) => (
                <div
                  key={row.field}
                  className={`grid grid-cols-[1fr_auto_auto] gap-x-4 sm:gap-x-6 px-4 sm:px-5 py-3 border-b last:border-b-0 border-foreground/5 font-mono text-xs sm:text-sm transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                  }`}
                  style={{ transitionDelay: `${300 + i * 60}ms` }}
                >
                  <span className="truncate">{row.field}</span>
                  <span className="w-16 text-right text-foreground/70">{row.you}</span>
                  <span
                    className={`w-16 text-right ${row.chain === "sealed" ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {row.chain === "sealed" ? "▓▓▓▓" : row.chain}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-0 right-0 w-24 h-24 border-b border-l border-foreground/10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 border-t border-r border-foreground/10 pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
