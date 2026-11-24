"use client";

import { useCallback, useState } from "react";
import type { User } from "firebase/auth";
import type { DashboardSummary } from "@/lib/dashboard-summary";
import type { UserProfile } from "@/app/components/dashboard-types";

export function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (requestUser: User | null, requestProfile: UserProfile | null) => {
    if (!requestUser || !requestProfile) return;
    let token: string;
    try {
      token = await requestUser.getIdToken();
    } catch {
      setError("Sesi login tidak dapat diperbarui. Silakan login kembali.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/summary", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json() as DashboardSummary & { error?: string };
      if (!response.ok) throw new Error(result.error || "Ringkasan dashboard gagal dimuat.");
      setSummary(result);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Ringkasan dashboard gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { summary, setSummary, loading, setLoading, error, setError, refresh };
}
