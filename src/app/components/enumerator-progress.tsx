"use client";

import { PanelHeading } from "@/app/components/dashboard";
import { workflowStages, type DashboardSummary, type WorkflowStage } from "@/lib/dashboard-summary";

const stageLabels: Record<WorkflowStage, string> = {
  submitted: "Menunggu Koordinator",
  coordinator_review: "Supervisi Koordinator",
  awaiting_enumerator_signature: "Menunggu tanda tangan Anda",
  awaiting_coordinator_completion: "Menunggu Koordinator menyelesaikan",
  analyst_review: "Data Analis",
  finalized: "Database final",
  needs_revision: "Perlu perbaikan",
};

export function EnumeratorProgress({
  summary,
  loading,
  error,
  onRefresh,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section className="panel enumerator-progress" aria-label="Progres enumerator">
      <PanelHeading
        icon="↗"
        title="Progres Enumerator"
        subtitle="Rekap seluruh data yang masuk, hasil QC, dan tahapan workflow. Tidak menggunakan target per enumerator."
      />
      {error ? (
        <p className="enumerator-progress-empty" role="alert">{error}</p>
      ) : loading && !summary ? (
        <p className="enumerator-progress-empty" role="status">Memuat progres seluruh data...</p>
      ) : summary?.enumerators.length ? (
        <div className="enumerator-progress-list">
          {summary.enumerators.map((enumerator) => {
            const checked = enumerator.stages.finalized;
            const checkedPercent = enumerator.total ? Math.round((checked / enumerator.total) * 100) : 0;

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
                    <span>Sudah mencapai database final</span>
                    <strong>{checked} dari {enumerator.total} · {checkedPercent}%</strong>
                  </div>
                  <div
                    className="enumerator-progress-track"
                    role="progressbar"
                    aria-label={`Data ${enumerator.name} yang sudah diperiksa QC`}
                    aria-valuemin={0}
                    aria-valuemax={enumerator.total}
                    aria-valuenow={checked}
                  >
                    <span style={{ width: `${checkedPercent}%` }} />
                  </div>
                  <div className="enumerator-progress-statuses">
                    <span className="enumerator-progress-valid">Valid {enumerator.qc.valid}</span>
                    <span className="enumerator-progress-pending">Menunggu {enumerator.qc.pending}</span>
                    <span className="enumerator-progress-revision">Perlu perbaikan {enumerator.qc.needsRevision}</span>
                  </div>
                  <details className="enumerator-progress-stage-details">
                    <summary>Rincian tahapan workflow</summary>
                    <div className="enumerator-progress-stages" aria-label={`Tahapan workflow ${enumerator.name}`}>
                      {workflowStages.map((stage) => (
                        <span key={stage}>{stageLabels[stage]} <strong>{enumerator.stages[stage]}</strong></span>
                      ))}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="enumerator-progress-empty">Belum ada data enumerator untuk ditampilkan.</p>
      )}
      {summary && (
        <div className="enumerator-progress-footer">
          <span>Rekap seluruh {summary.total} data.</span>
          {loading && <span role="status">Memperbarui...</span>}
          <button type="button" className="button button-secondary" onClick={onRefresh} disabled={loading}>
            {loading ? "Memperbarui..." : "Perbarui ringkasan"}
          </button>
        </div>
      )}
    </section>
  );
}
