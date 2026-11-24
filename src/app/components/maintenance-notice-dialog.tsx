"use client";

import { useEffect, useRef, type SyntheticEvent } from "react";

export function MaintenanceNoticeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="maintenance-notice-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-notice-title"
      aria-describedby="maintenance-notice-description"
      onCancel={handleCancel}
    >
      <section className="maintenance-notice-content">
        <div className="maintenance-notice-icon" aria-hidden="true">i</div>
        <p className="eyebrow">Informasi pembaruan</p>
        <h2 id="maintenance-notice-title">Penyesuaian UI/UX Webapp</h2>
        <p id="maintenance-notice-description">
          Mulai <strong>24 November hingga 26 November 2026</strong>, Webapp akan mengalami penyesuaian tampilan dan pengalaman penggunaan (UI/UX).
        </p>
        <p className="maintenance-notice-safe">
          Penyesuaian ini tidak mengganggu kinerja. Webapp tetap dapat digunakan seperti biasa untuk pemetaan hotspot.
        </p>
        <div className="maintenance-notice-actions">
          <button type="button" className="button button-primary" onClick={onClose} autoFocus>
            Saya mengerti
          </button>
        </div>
      </section>
    </dialog>
  );
}
