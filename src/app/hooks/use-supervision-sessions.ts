"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { collection, onSnapshot, query } from "firebase/firestore";
import { mapSupervisionSnapshot } from "@/app/components/dashboard-data-mappers";
import type { UserProfile } from "@/app/components/dashboard-types";
import type { SupervisionSession } from "@/app/components/supervision-workflow";
import { db } from "@/lib/firebase";

export function useSupervisionSessions(authUser: User | null, userProfile: UserProfile | null, isEnumerator: boolean) {
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [loadedForUid, setLoadedForUid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const loading = Boolean(authUser && loadedForUid !== authUser.uid);

  useEffect(() => {
    if (!authUser || !userProfile) return;
    if (isEnumerator) {
      let active = true;
      const loadActiveSessions = async () => {
        try {
          const token = await authUser.getIdToken();
          const response = await fetch("/api/supervisions/active", {
            headers: { Authorization: ["Bearer", token].join(" ") },
            cache: "no-store",
          });
          const result = await response.json() as { sessions?: SupervisionSession[]; error?: string };
          if (!response.ok) throw new Error(result.error || "Sesi supervisi belum dapat dimuat.");
          if (!Array.isArray(result.sessions)) throw new Error("Respons daftar sesi supervisi tidak valid.");
          if (!active) return;
          setSessions(result.sessions);
          setError("");
        } catch (sessionError) {
          if (!active) return;
          setError(sessionError instanceof Error ? sessionError.message : "Sesi supervisi belum dapat dimuat.");
        } finally {
          if (active) setLoadedForUid(authUser.uid);
        }
      };
      void loadActiveSessions();
      const intervalId = window.setInterval(() => void loadActiveSessions(), 15_000);
      return () => {
        active = false;
        window.clearInterval(intervalId);
      };
    }

    if (!db) return;
    const sessionsQuery = query(collection(db, "supervisions"));
    return onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(mapSupervisionSnapshot(snapshot));
      setLoadedForUid(authUser.uid);
      setError("");
    }, () => {
      setError("Sesi supervisi belum dapat dimuat. Silakan muat ulang dashboard.");
      setLoadedForUid(authUser.uid);
    });
  }, [authUser, isEnumerator, refreshKey, userProfile]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { sessions, setSessions, loading, error, setError, refresh };
}
