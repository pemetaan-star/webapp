"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const dismissedKey = "lingga-install-notice-dismissed";

export function InstallAppNotice() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installError, setInstallError] = useState("");

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (isStandalone) return;

    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    try {
      if (sessionStorage.getItem(dismissedKey)) return;
    } catch {
      // The notice can still be dismissed for the current page if storage is unavailable.
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const showNotice = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsIos(ios);
        setVisible(true);
      }, 2500);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      showNotice();
    };
    const handleAppInstalled = () => {
      if (timer) clearTimeout(timer);
      setVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    if (ios) showNotice();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(dismissedKey, "1");
    } catch {
      // Keep the dismissal in component state when storage is unavailable.
    }
  }

  async function install() {
    if (!installPrompt) {
      setInstallError("");
      setShowInstructions(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      setInstallPrompt(null);
      setInstallError("Pemasangan belum dapat dimulai. Buka menu browser dan pilih opsi instal aplikasi.");
    }
  }

  if (!visible) return null;

  return (
    <aside className="install-notice" aria-label="Instal aplikasi">
      <Image src="/lingga-indonesia-icon.svg" alt="" width={44} height={44} />
      <div className="install-notice-copy">
        <strong>Pasang aplikasi Pemetaan Hotspot</strong>
        <p>{installError || (showInstructions ? isIos ? "Tekan Bagikan, lalu pilih “Tambahkan ke Layar Utama”." : "Buka menu browser, lalu pilih “Instal aplikasi”." : "Buka lebih cepat dari layar utama perangkat Anda.")}</p>
      </div>
      {!showInstructions && <button type="button" className="install-notice-action" onClick={() => void install()}>{isIos || installError ? "Cara pasang" : "Pasang"}</button>}
      <button type="button" className="install-notice-close" onClick={dismiss} aria-label="Tutup pemberitahuan">×</button>
    </aside>
  );
}
