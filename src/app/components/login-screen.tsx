import NextImage from "next/image";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useState } from "react";
import { DashboardIcon } from "@/app/components/dashboard-icon";
import { auth, db, firebaseConfigured } from "@/lib/firebase";

export function LoginScreen({ onLogin, loginError, setLoginError }: { onLogin: (user: User) => void; loginError: string; setLoginError: (value: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError("Username dan sandi wajib diisi.");
      return;
    }
    if (!firebaseConfigured) {
      setLoginError("Sistem autentikasi belum dikonfigurasi. Hubungi administrator.");
      return;
    }
    if (!auth) {
      setLoginError("Sistem autentikasi belum siap. Hubungi administrator.");
      return;
    }
    try {
      if (!db) {
        setLoginError("Sistem data belum siap. Periksa konfigurasi aplikasi.");
        return;
      }
      const userQuery = query(collection(db, "user"), where("username", "==", username.trim()), limit(1));
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.empty) {
        setLoginError(`Username "${username.trim()}" tidak ditemukan.`);
        return;
      }
      const profile = userSnapshot.docs[0]?.data() as { email?: string } | undefined;
      if (!profile?.email) {
        setLoginError("Profil username ditemukan, tetapi data akun belum lengkap.");
        return;
      }
      const result = await signInWithEmailAndPassword(auth, profile.email, password);
      onLogin(result.user);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "permission-denied") {
        setLoginError("Akses data ditolak. Periksa status akun Anda atau hubungi administrator.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setLoginError("Password tidak cocok untuk username ini.");
      } else {
        setLoginError("Login gagal. Periksa kembali username dan password Anda, atau hubungi administrator.");
      }
    }
  }

  return <main className="login-page">
    <div className="login-layout">
      <section className="login-intro" aria-label="Tentang Pemetaan Hotspot Malang">
        <div className="login-brand-lockup">
          <span className="login-brand-mark"><NextImage src="/icons/lingga-512.png" alt="Lingga Indonesia" width={58} height={58} priority /></span>
          <span><strong>Lingga Indonesia</strong><small>Platform pemetaan data</small></span>
        </div>
        <div className="login-intro-copy">
          <span className="login-kicker"><i /> KOTA MALANG · 2026</span>
          <h1>Pemetaan yang lebih terarah.</h1>
          <p>Kelola data lapangan, pantau persebaran, dan pastikan setiap pendataan melalui pemeriksaan kualitas yang terukur.</p>
        </div>
        <div className="login-map-card" aria-hidden="true">
          <div className="login-map-grid" />
          <span className="login-map-label login-map-label-one">KOTA MALANG</span>
          <span className="login-map-label login-map-label-two">PEMETAAN LAPANGAN</span>
          <span className="login-map-pin login-map-pin-one" />
          <span className="login-map-pin login-map-pin-two" />
          <span className="login-map-pin login-map-pin-three" />
          <span className="login-map-ring login-map-ring-one" />
          <span className="login-map-ring login-map-ring-two" />
          <div className="login-map-caption"><span className="login-map-caption-icon"><DashboardIcon name="map" /></span><span><strong>Monitoring terpusat</strong><small>Data lapangan dalam satu alur</small></span><span className="login-map-caption-status" /></div>
        </div>
        <div className="login-features">
          <div><span><DashboardIcon name="check" /></span>Pemantauan data terpusat</div>
          <div><span><DashboardIcon name="check" /></span>Pemeriksaan kualitas data</div>
          <div><span><DashboardIcon name="check" /></span>Pembaruan data lapangan</div>
        </div>
        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
      </section>
      <section className="login-form">
        <div className="login-secure-badge"><span aria-hidden="true"><DashboardIcon name="check" /></span> AKSES PENGGUNA TERLINDUNGI</div>
        <p className="eyebrow">Selamat datang kembali</p>
        <h2>Masuk ke akun Anda</h2>
        <p className="login-form-copy">Gunakan username dan sandi yang terdaftar untuk melanjutkan ke dashboard.</p>
        <form onSubmit={submitLogin}>
          <label htmlFor="username">Username</label>
          <div className="login-input">
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.2 3-5 7-5s6.3 1.8 7 5" /></svg></span>
            <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Masukkan username" />
          </div>
          <label htmlFor="password">Kata sandi</label>
          <div className="login-input">
            <span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Masukkan kata sandi" />
          </div>
          {loginError && <p className="login-error" role="alert">{loginError}</p>}
          <button className="login-submit" type="submit"><span>Masuk ke dashboard</span><span className="login-submit-arrow" aria-hidden="true">→</span></button>
        </form>
        <p className="login-footer"><span className="login-footer-mark">L</span><span>Lingga Indonesia<small>Pemetaan Kota Malang 2026</small></span><span className="login-footer-dot" /><span className="login-footer-secure">Data Anda terlindungi</span></p>
      </section>
    </div>
  </main>;}
