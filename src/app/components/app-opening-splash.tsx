"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const splashDuration = 4500;

export function AppOpeningSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), splashDuration);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="app-opening-splash" role="status" aria-live="polite" aria-label="Menyiapkan Pemetaan Hotspot Malang">
      <div className="splash-orbit splash-orbit-outer" aria-hidden="true" />
      <div className="splash-orbit splash-orbit-inner" aria-hidden="true" />
      <div className="splash-card">
        <div className="splash-logo-wrap">
          <span className="splash-logo-glow" aria-hidden="true" />
          <Image src="/icons/lingga-512.png" alt="Lingga Indonesia" width={116} height={116} loading="eager" />
        </div>
        <p className="splash-eyebrow">LINGGA INDONESIA</p>
        <h1>Pemetaan Hotspot</h1>
        <p className="splash-location">Kota Malang · 2026</p>
        <div className="splash-progress" aria-hidden="true"><span /></div>
        <p className="splash-status">Menyiapkan ruang kerja Anda · Versi 1.1</p>
      </div>
      <span className="splash-corner splash-corner-top" aria-hidden="true" />
      <span className="splash-corner splash-corner-bottom" aria-hidden="true" />
    </div>
  );
}
