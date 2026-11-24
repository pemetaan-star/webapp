"use client";

import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

export function ActionConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
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
    if (!busy) onCancel();
  }

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && !busy) onCancel();
  }

  return <dialog
    ref={dialogRef}
    className="action-confirmation-dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="action-confirmation-title"
    aria-describedby="action-confirmation-description"
    aria-busy={busy}
    onCancel={handleCancel}
    onClick={handleDialogClick}
  >
    <section className="action-confirmation-content">
      <p className="eyebrow">Konfirmasi tindakan</p>
      <h2 id="action-confirmation-title">{title}</h2>
      <p id="action-confirmation-description">{description}</p>
      {error && <p className="action-confirmation-error" role="alert">{error}</p>}
      <div className="action-confirmation-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy} autoFocus>Batal</button>
        <button type="button" className="button action-confirmation-confirm" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </section>
  </dialog>;
}
