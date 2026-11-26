"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetSymbol } from "@/lib/assets";

const STORAGE_KEY = "qlever.sip.plans.v1";

export type SipFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface SipPlan {
  id: string;
  asset: AssetSymbol;
  collateralQOR: number;
  leverage: number;
  frequency: SipFrequency;
  isActive: boolean;
  createdAt: string;
  nextRunAt: string;
  lastRunAt?: string;
  runCount: number;
}

export interface CreateSipPlanInput {
  asset: AssetSymbol;
  collateralQOR: number;
  frequency: SipFrequency;
  startAt?: string;
}

function addFrequency(baseIso: string, frequency: SipFrequency): string {
  const next = new Date(baseIso);
  if (frequency === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "WEEKLY") {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

function sanitizePlan(plan: SipPlan): SipPlan | null {
  if (!plan.id) return null;
  if (!plan.asset) return null;
  if (!Number.isFinite(plan.collateralQOR) || plan.collateralQOR <= 0) return null;
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(plan.frequency)) return null;

  return {
    ...plan,
    collateralQOR: Number(plan.collateralQOR),
    leverage: 1,
    runCount: Number.isFinite(plan.runCount) ? plan.runCount : 0,
    isActive: Boolean(plan.isActive),
  };
}

export function useSipPlans() {
  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timerId = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as SipPlan[]) : [];
        const valid = parsed
          .map(sanitizePlan)
          .filter((p): p is SipPlan => p !== null)
          .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());

        if (!cancelled) {
          setPlans(valid);
          setIsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setPlans([]);
          setIsLoaded(true);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }, [isLoaded, plans]);

  const createPlan = useCallback((input: CreateSipPlanInput) => {
    const nowIso = new Date().toISOString();
    const startIso = input.startAt ?? nowIso;

    const next: SipPlan = {
      id: `sip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      asset: input.asset,
      collateralQOR: input.collateralQOR,
      leverage: 1,
      frequency: input.frequency,
      isActive: true,
      createdAt: nowIso,
      nextRunAt: startIso,
      runCount: 0,
    };

    setPlans((prev) => [...prev, next].sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime()));
    return next;
  }, []);

  const deletePlan = useCallback((id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const togglePlan = useCallback((id: string) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)));
  }, []);

  const markPlanExecuted = useCallback((id: string, executedAtIso?: string) => {
    const executedAt = executedAtIso ?? new Date().toISOString();
    setPlans((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              lastRunAt: executedAt,
              nextRunAt: addFrequency(executedAt, p.frequency),
              runCount: p.runCount + 1,
            }
          : p
      )
    );
  }, []);

  return {
    plans,
    isLoaded,
    createPlan,
    deletePlan,
    togglePlan,
    markPlanExecuted,
  };
}
