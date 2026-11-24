"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { mapSubmissionSnapshot } from "@/app/components/dashboard-data-mappers";
import type { Hotspot, UserProfile } from "@/app/components/dashboard-types";
import { db } from "@/lib/firebase";

const SUBMISSIONS_PAGE_SIZE = 25;

type SubmissionCursor = QueryDocumentSnapshot<DocumentData> | null;

export function useSubmissionFeed(authUser: User | null, userProfile: UserProfile | null, isEnumerator: boolean) {
  const [rows, setRows] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<SubmissionCursor>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!db || !authUser || !userProfile) return;
    const firestore = db;
    const submissionsQuery = isEnumerator
      ? query(collection(firestore, "submissions"), where("enumeratorUid", "==", authUser.uid), limit(SUBMISSIONS_PAGE_SIZE))
      : query(collection(firestore, "submissions"), orderBy("createdAt", "desc"), limit(SUBMISSIONS_PAGE_SIZE));
    const unsubscribe = onSnapshot(submissionsQuery, async (snapshot) => {
      try {
        const nextRows = await mapSubmissionSnapshot(snapshot, firestore);
        setRows(nextRows);
        setCursor(snapshot.docs.length === SUBMISSIONS_PAGE_SIZE ? snapshot.docs.at(-1) || null : null);
      } catch {
        setError("Data tidak dapat ditampilkan pada dashboard saat ini.");
      } finally {
        setLoading(false);
      }
    }, (snapshotError) => {
      const code = snapshotError instanceof Error && "code" in snapshotError ? String(snapshotError.code) : "";
      setError(code === "permission-denied"
        ? "Akses data ditolak. Pastikan profil pengguna sudah lengkap dan memiliki akses yang benar."
        : code === "failed-precondition"
          ? "Data belum dapat dimuat. Silakan hubungi administrator."
          : "Data tidak dapat dimuat. Silakan coba lagi atau hubungi administrator.");
      setLoading(false);
    });
    return unsubscribe;
  }, [authUser, isEnumerator, userProfile]);

  const loadMore = useCallback(async () => {
    if (!db || !authUser || !userProfile || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextQuery = isEnumerator
        ? query(collection(db, "submissions"), where("enumeratorUid", "==", authUser.uid), startAfter(cursor), limit(SUBMISSIONS_PAGE_SIZE))
        : query(collection(db, "submissions"), orderBy("createdAt", "desc"), startAfter(cursor), limit(SUBMISSIONS_PAGE_SIZE));
      const snapshot = await getDocs(nextQuery);
      const nextRows = await mapSubmissionSnapshot(snapshot, db);
      setRows((current) => [...current, ...nextRows]);
      setCursor(snapshot.docs.length === SUBMISSIONS_PAGE_SIZE ? snapshot.docs.at(-1) || null : null);
    } catch {
      setError("Halaman data berikutnya tidak dapat dimuat.");
    } finally {
      setLoadingMore(false);
    }
  }, [authUser, cursor, isEnumerator, loadingMore, userProfile]);

  return {
    rows,
    setRows,
    loading,
    setLoading,
    error,
    setError,
    cursor,
    loadingMore,
    loadMore,
  };
}
