"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useAccount, useBalance } from "wagmi";
import { useTier } from "@/hooks/use-qlever";
import { tierLabel } from "@/lib/qlever";

const VerifyIdentityModal = dynamic(
  () => import("@/components/dashboard/verify-identity-modal").then((m) => m.VerifyIdentityModal),
  { ssr: false }
);

export function AppNav() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isLandingPage = pathname === "/";
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const tier = useTier();
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { name: "Trade", href: "/trade" },
    { name: "DCA", href: "/sip" },
    { name: "Portfolio", href: "/portfolio" },
    { name: "Keeper", href: "/keeper" },
    { name: "How it works", href: isLandingPage ? "#how-it-works" : "/#how-it-works" },
  ];

  const connectButton = (full = false) => (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
        const connected = mounted && account && chain;
        return (
          <button
            onClick={() => { (connected ? openAccountModal : openConnectModal)(); setIsMobileMenuOpen(false); }}
            className={
              full
                ? "w-full border border-foreground/20 h-14 text-base font-mono hover:bg-foreground/5 transition-colors"
                : `font-mono border border-foreground/20 hover:border-foreground/60 hover:bg-foreground/5 transition-all duration-300 ${isLandingPage && isScrolled ? "px-3 h-8 text-xs rounded-full" : "px-4 py-2 text-xs"}`
            }
          >
            {connected ? account.displayName : "Connect Wallet"}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );

  return (
    <>
      <header className={`fixed z-50 transition-all duration-500 ${isLandingPage && isScrolled ? "top-4 left-4 right-4" : "top-0 left-0 right-0"}`}>
        <nav
          className={`mx-auto transition-all duration-500 ${
            isLandingPage && (isScrolled || isMobileMenuOpen)
              ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]"
              : isLandingPage
              ? "bg-transparent max-w-[1400px]"
              : "bg-background/90 backdrop-blur-xl border-b border-foreground/10"
          }`}
        >
          <div className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${isLandingPage && isScrolled ? "h-14" : "h-16"}`}>
            <Link href="/" className="flex items-center gap-2">
              <span className="font-display text-xl tracking-tight">Qlever</span>
              <span className="text-muted-foreground font-mono text-[10px] mt-0.5">PQ-SEALED</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) =>
                item.href.startsWith("#") ? (
                  <a key={item.name} href={item.href} className="px-4 py-2 font-mono text-xs text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors">
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 font-mono text-xs transition-colors ${pathname === item.href ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground hover:bg-foreground/5"}`}
                  >
                    {item.name}
                  </Link>
                )
              )}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {!isLandingPage && isConnected && (
                <>
                  {bal && <span className="font-mono text-[10px] text-muted-foreground">{Number(bal.formatted).toFixed(2)} QOR</span>}
                  {tier.isVerified && (
                    <span className="font-mono text-[10px] px-2 py-1 border border-foreground/20">
                      T{tier.tier}<span className="text-muted-foreground"> • {tierLabel(tier.tier)}</span>
                    </span>
                  )}
                  <button
                    onClick={() => setVerifyOpen(true)}
                    className={`font-mono text-xs px-3 py-2 border transition-colors ${tier.isVerified ? "border-green-700/40 text-green-700 hover:bg-green-700/5" : "border-foreground/40 hover:bg-foreground/5 animate-pulse"}`}
                  >
                    {tier.isVerified ? "Verified" : "Verify Identity"}
                  </button>
                </>
              )}
              {connectButton()}
            </div>

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2" aria-label="Toggle menu">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>
      </header>

      {verifyOpen && <VerifyIdentityModal open={verifyOpen} onOpenChange={setVerifyOpen} />}

      <div className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-500 ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="flex flex-col h-full px-8 pt-28 pb-8">
          <div className="flex-1 flex flex-col justify-center gap-8">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} onClick={() => setIsMobileMenuOpen(false)} className="text-4xl font-display text-foreground hover:text-muted-foreground transition-colors">
                {item.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3 pt-8 border-t border-foreground/10">{connectButton(true)}</div>
        </div>
      </div>
    </>
  );
}
