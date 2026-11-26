"use client";

import { useEffect, useState, useRef } from "react";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";

const securityFeatures = [
  {
    icon: Shield,
    title: "Harvest-now-decrypt-later resistant",
    description: "Position data is sealed with ML-KEM-1024. Ciphertext recorded today cannot be opened by a future quantum computer.",
  },
  {
    icon: Lock,
    title: "Client-side only",
    description: "Encryption and decryption happen in your browser. Plaintext position data is never sent to, or stored on, any server.",
  },
  {
    icon: Eye,
    title: "Keeper cannot forge",
    description: "Every reveal is hash-checked against the commitment made at open. A Keeper can withhold a liquidation, but can never fabricate one.",
  },
  {
    icon: FileCheck,
    title: "Disclosed trade-offs",
    description: "MVP uses a single permissioned Keeper and a signed price relay. Threshold decryption and bonded Keepers are future work.",
  },
];

const properties = ["ML-KEM-1024", "Commit-reveal", "Client-side crypto", "Real price data", "Hash-verified"];

export function SecuritySection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setIsVisible(true); }, { threshold: 0.1 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="security" ref={sectionRef} className="relative py-24 lg:py-32 bg-foreground/[0.02] overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Security model
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Privacy without
              <br />
              exposure.
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-12">
              Qlever was designed so a position is unreadable until the exact,
              cryptographically verified moment it is acted on, and never forgeable.
            </p>
            <div className="flex flex-wrap gap-3">
              {properties.map((prop, index) => (
                <span
                  key={prop}
                  className={`px-4 py-2 border border-foreground/10 text-sm font-mono transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 50 + 200}ms` }}
                >
                  {prop}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            {securityFeatures.map((feature, index) => (
              <div
                key={feature.title}
                className={`p-6 border border-foreground/10 hover:border-foreground/20 transition-all duration-500 group ${
                  isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 flex items-center justify-center border border-foreground/10 group-hover:bg-foreground group-hover:text-background transition-colors duration-300">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium mb-1 group-hover:translate-x-1 transition-transform duration-300">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
