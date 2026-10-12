"use client";

import type { User } from "firebase/auth";
import { useEffect, useRef, useState } from "react";

type ExportFormat = "csv" | "xlsx" | "sav";

const formats: Array<{ format: ExportFormat; label: string }> = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV" },
  { format: "sav", label: "SPSS (.sav)" },
];

export function FinalDataExport({ user }: { user: User | null }) {
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function closeMenu(event: MouseEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  async function download(format: ExportFormat) {
    if (!user || downloading) return;
    setMenuOpen(false);
    setDownloading(format);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/exports/final?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "Unduhan rekapitulasi gagal dibuat.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `lingga-database-final-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unduhan rekapitulasi gagal dibuat.");
    } finally {
      setDownloading(null);
    }
  }

  return <section className="panel final-data-export" aria-label="Unduh rekapitulasi data final">
    <div>
      <strong>Rekapitulasi Database Final</strong>
      <p>Hanya data berstatus Database final. File SPSS dapat dibuka langsung di IBM SPSS Statistics.</p>
    </div>
    <div className="final-data-export-menu" ref={menuRef}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls="final-data-export-options"
        className="button button-primary"
        disabled={!user || downloading !== null}
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        {downloading ? "Menyiapkan..." : "Unduh rekapitulasi"}
        <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
      </button>
      {menuOpen && <div className="final-data-export-options" id="final-data-export-options" role="menu" aria-label="Pilih format unduhan">
        {formats.map(({ format, label }) => (
          <button
            key={format}
            onClick={() => void download(format)}
            role="menuitem"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>}
    </div>
    {error && <p className="login-error final-data-export-error" role="alert">{error}</p>}
  </section>;
}
