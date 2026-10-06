"use client";

import { PanelHeading } from "@/app/components/dashboard";

type EnumeratorProgressRow = {
  id: string;
  enumeratorUid?: string;
  enumeratorName?: string;
  enumeratorUsername?: string;
  qc: "Valid" | "Pending" | "Perlu perbaikan";
};

type EnumeratorSummary = {
  id: string;
  name: string;
  username: string;
  total: number;
  valid: number;
  pending: number;
  needsRevision: number;
};

function summarizeEnumerators(rows: EnumeratorProgressRow[]) {
  const summaries = new Map<string, EnumeratorSummary>();

  rows.forEach((row) => {
    const name = row.enumeratorName?.trim() || "Nama belum diatur";
    const username = row.enumeratorUsername?.trim() || "";
    const id = row.enumeratorUid || username || name.toLowerCase();
    const summary = summaries.get(id) || {
      id,
      name,
      username,
      total: 0,
      valid: 0,
      pending: 0,
      needsRevision: 0,
    };

    summary.total += 1;
    if (row.qc === "Valid") summary.valid += 1;
    else if (row.qc === "Perlu perbaikan") summary.needsRevision += 1;
    else summary.pending += 1;
    summaries.set(id, summary);
  });

  return [...summaries.values()].sort((first, second) =>
    second.total - first.total || first.name.localeCompare(second.name, "id"),
  );
}

export function EnumeratorProgress({
  rows,
  loading,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  rows: EnumeratorProgressRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const enumerators = summarizeEnumerators(rows);

  return (
    <section className="panel enumerator-progress" aria-label="Progres enumerator">
      <PanelHeading
        icon="↗"
        title="Progres Enumerator"
        subtitle="Jumlah data yang masuk dan status pemeriksaan kualitas per enumerator."
      />
      {loading && rows.length === 0 ? (
        <p className="enumerator-progress-empty">Memuat progres enumerator...</p>
      ) : enumerators.length ? (
        <div className="enumerator-progress-list">
          {enumerators.map((enumerator) => {
            const reviewed = enumerator.valid + enumerator.needsRevision;
            const percentage = Math.round((reviewed / enumerator.total) * 100);

            return (
              <article className="enumerator-progress-row" key={enumerator.id}>
                <div className="enumerator-progress-person">
                  <strong>{enumerator.name}</strong>
                  {enumerator.username && <small>{enumerator.username}</small>}
                </div>
                <div className="enumerator-progress-count">
                  <strong>{enumerator.total}</strong>
                  <small>data masuk</small>
                </div>
                <div className="enumerator-progress-review">
                  <div className="enumerator-progress-review-label">
                    <span>Sudah diperiksa</span>
                    <strong>{percentage}%</strong>
                  </div>
                  <div
                    className="enumerator-progress-track"
                    role="progressbar"
                    aria-label={`Data ${enumerator.name} yang sudah diperiksa`}
                    aria-valuemin={0}
                    aria-valuemax={enumerator.total}
                    aria-valuenow={reviewed}
                  >
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="enumerator-progress-statuses">
                    <span className="enumerator-progress-valid">Valid {enumerator.valid}</span>
                    <span className="enumerator-progress-pending">Menunggu {enumerator.pending}</span>
                    <span className="enumerator-progress-revision">Perlu perbaikan {enumerator.needsRevision}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="enumerator-progress-empty">Belum ada data enumerator untuk ditampilkan.</p>
      )}
      {canLoadMore && (
        <div className="enumerator-progress-footer">
          <span>Ringkasan berdasarkan {rows.length} data yang dimuat.</span>
          <button type="button" className="button button-secondary" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Memuat..." : "Muat data berikutnya"}
          </button>
        </div>
      )}
    </section>
  );
}
