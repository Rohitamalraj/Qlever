"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Instrument_Serif } from "next/font/google";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
import { LiveQuotesStrip } from "./live-quotes-strip";

const HeroShowcase = dynamic(() => import("./hero-showcase").then((m) => m.HeroShowcase), { ssr: false });

const facts = ["Post-quantum ML-KEM-1024", "ML-DSA-87 signed accounts", "Harvest-now-decrypt-later safe", "Real stock prices", "Liquidations that can't be faked"];

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => setIsVisible(true), []);

  const reveal = (delay = 0) => ({
    className: `transition-all duration-700 motion-reduce:transition-none ${
      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    }`,
    style: { transitionDelay: `${delay}ms` },
  });

  return (
    <section className="relative overflow-hidden">
      {/* Background: fine grid, faded toward the edges */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60 [mask-image:radial-gradient(ellipse_at_60%_40%,black,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pt-20 sm:pt-24 lg:pt-24 pb-8 lg:pb-10">
        <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-10 lg:gap-12 items-center">
          {/* Copy */}
          <div>
            <div {...reveal(0)}>
              <span className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/70 px-3 py-1 font-mono text-[11px] sm:text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                Post-quantum trading on QoreChain · Build Before Q-Day
              </span>
            </div>

            <h1
              className={`mt-5 ${serif.className} tracking-tight leading-[1] whitespace-nowrap text-[clamp(2.6rem,5.4vw,5.5rem)] ${reveal(80).className}`}
              style={reveal(80).style}
            >
              Trade stocks, <em className="italic text-teal-700">privately</em>.
              <span className="block">Safe from <em className="italic text-teal-700">quantum</em>.</span>
            </h1>

            <p
              className={`mt-5 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed ${reveal(160).className}`}
              style={reveal(160).style}
            >
              Go long or short on Apple, NVIDIA, Tesla and more, with leverage. Your position is encrypted in
              your browser with <span className="text-foreground">ML-KEM-1024</span>, the post-quantum standard (NIST FIPS 203),
              so it stays private even against future quantum computers. Only you and the liquidation Keeper can read it;
              the chain sees just a hash.
            </p>

            <div className={`mt-7 flex flex-col sm:flex-row sm:items-center gap-3 ${reveal(240).className}`} style={reveal(240).style}>
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
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 px-2 h-12 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                How it works
                <ArrowDown className="w-3.5 h-3.5" />
              </a>
            </div>

            <ul className={`mt-7 flex flex-wrap gap-x-5 gap-y-2 ${reveal(320).className}`} style={reveal(320).style}>
              {facts.map((f) => (
                <li key={f} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="w-1 h-1 bg-foreground/40" />
                  {f}
                </li>
              ))}
            </ul>

          </div>

          {/* Revolving markets */}
          <div className={reveal(200).className} style={reveal(200).style}>
            <figure className="relative h-[460px] sm:h-[520px] lg:h-[560px] -mx-4 sm:mx-0">
              <HeroShowcase />
            </figure>
          </div>
        </div>
      </div>

      <div className={`relative z-10 ${reveal(400).className}`} style={reveal(400).style}>
        <LiveQuotesStrip />
      </div>
    </section>
  );
}
