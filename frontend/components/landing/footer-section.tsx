"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatedWave } from "./animated-wave";
import Link from "next/link";

const footerLinks: Record<string, { name: string; href: string }[]> = {
  Product: [
    { name: "Trade", href: "/trade" },
    { name: "DCA plans", href: "/sip" },
    { name: "Portfolio", href: "/portfolio" },
    { name: "Keeper", href: "/keeper" },
  ],
  Protocol: [
    { name: "Features", href: "#features" },
    { name: "How it works", href: "#how-it-works" },
    { name: "Security", href: "#security" },
    { name: "For developers", href: "#protocol" },
  ],
  QoreChain: [
    { name: "QoreChain docs", href: "https://docs.qorechain.io" },
    { name: "QoreSeal", href: "https://docs.qorechain.io/developer-tools/qoreseal" },
    { name: "Networks", href: "https://docs.qorechain.io/appendix/networks" },
    { name: "Explorer", href: "https://explore.qore.network" },
  ],
};

export function FooterSection() {
  return (
    <footer className="relative border-t border-foreground/10">
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10 lg:gap-8">
            <div className="col-span-2">
              <Link href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">Qlever</span>
                <span className="text-xs text-muted-foreground font-mono">PQ-SEALED</span>
              </Link>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                Quantum-safe confidential leveraged trading on QoreChain. Sealed at open, verified at reveal.
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Testnet software. Not investment advice.
              </p>
            </div>

            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 group"
                      >
                        {link.name}
                        {link.href.startsWith("http") && (
                          <ArrowUpRight className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            2026 Qlever. Built for the QoreChain Build Before Q-Day hackathon.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/trade" className="hover:text-foreground transition-colors font-mono text-xs">
              Launch App →
            </Link>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-600" />
              QoreChain testnet
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
