import { useRef, useState } from "react";
import { organizationOptions } from "@/lib/organizations";
import type { UserProfile } from "@/app/components/dashboard-types";
import { normalizeRole } from "@/app/components/dashboard-roles";

export function UserManagementModal({ users, loading, error, editingUser, creatingUser, currentUserIds, onClose, onAdd, onCancelEdit, onEdit, onSave, onCreate, onDelete }: { users: UserProfile[]; loading: boolean; error: string; editingUser: UserProfile | null; creatingUser: boolean; currentUserIds: Array<string | undefined>; onClose: () => void; onAdd: () => void; onCancelEdit: () => void; onEdit: (user: UserProfile | null) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onDelete: (user: UserProfile) => void }) {
  const [roleOverride, setRoleOverride] = useState<{ userId: string | null; role: string } | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const savingUserRef = useRef(false);
  const isFormOpen = Boolean(editingUser) || creatingUser;
  const storedRole = normalizeRole(editingUser?.role);
  const currentRole = roleOverride?.userId === (editingUser?.id || null)
    ? roleOverride.role
    : storedRole === "supervisor" ? "koordinator" : editingUser?.role || "enumerator";

  async function submitUser(event: React.FormEvent<HTMLFormElement>) {
    if (savingUserRef.current) {
      event.preventDefault();
      return;
    }

    savingUserRef.current = true;
    setSavingUser(true);
    try {
      await (creatingUser ? onCreate(event) : onSave(event));
    } finally {
      savingUserRef.current = false;
      setSavingUser(false);
    }
  }

  return (
    <div className="user-modal-backdrop" role="presentation">
      <section className="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-management-title">
        <div className="user-modal-header">
          <div>
            <p className="eyebrow">Panel administrator</p>
            <h2 id="user-management-title">Manajemen User</h2>
            <p>Kelola profil, username, email, dan role pengguna.</p>
            {!isFormOpen && <button type="button" className="button button-primary" onClick={() => { setRoleOverride(null); onAdd(); }}>＋ Tambah user</button>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Tutup" disabled={savingUser}>×</button>
        </div>
        {error && <p className="login-error user-modal-error">{error}</p>}
        {isFormOpen ? (
          <form className="user-edit-form" onSubmit={submitUser} aria-busy={savingUser}>
            <label>Username<input name="username" defaultValue={editingUser?.username || ""} required /></label>
            <label>Email<input name="email" type="email" defaultValue={editingUser?.email || ""} required /></label>
            <label>Nama<input name="nama" defaultValue={editingUser?.nama || ""} required /></label>
            {creatingUser && <label>Password awal<input name="password" type="password" autoComplete="new-password" minLength={6} required /></label>}
            {editingUser && <label>Sandi baru (opsional)<input name="newPassword" type="password" autoComplete="new-password" minLength={6} /><small>Kosongkan jika tidak ingin mengubah sandi. Minimal 6 karakter.</small></label>}
            <label>Role<select name="role" value={currentRole} onChange={(event) => setRoleOverride({ userId: editingUser?.id || null, role: event.target.value })}><option value="admin">Admin</option><option value="data analis">Data Analis</option><option value="koordinator">Koordinator</option><option value="enumerator">Enumerator</option></select>{storedRole === "supervisor" && <small>Role lama akan dialihkan ke Koordinator sesuai proposal.</small>}</label>
            {(creatingUser || editingUser) && currentRole === "enumerator" && <label>Organisasi Enumerator<select name="organisasi" defaultValue={editingUser?.organisasi || ""} required><option value="">Pilih organisasi</option>{organizationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {currentRole === "enumerator" && <label className="manual-gps-permission"><input name="manualGpsEnabled" type="checkbox" defaultChecked={editingUser?.manualGpsEnabled === true} /> Izinkan input koordinat GPS manual<small>Enumerator ini dapat mengetik lintang dan bujur jika GPS perangkat tidak tersedia.</small></label>}
            {savingUser && <div className="form-saving-indicator form-wide" role="status" aria-live="polite"><span className="form-saving-brand" aria-hidden="true" /><strong>Menyimpan user...</strong><small>{creatingUser ? "Membuat akun dan profil user." : "Memperbarui profil user."}</small><i className="form-saving-track" aria-hidden="true" /></div>}
            <div className="user-modal-actions">
              <button type="button" className="button button-secondary" onClick={() => { setRoleOverride(null); onCancelEdit(); }} disabled={savingUser}>Batal</button>
              <button type="submit" className="button button-primary" disabled={savingUser}>{savingUser ? "Menyimpan..." : creatingUser ? "Buat user" : "Simpan profil"}</button>
            </div>
          </form>
        ) : (
          <div className="user-table-wrap">
            {loading ? <p className="user-empty">Memuat daftar user...</p> : users.length === 0 ? <p className="user-empty">Belum ada profil user.</p> : (
              <table>
                <thead><tr><th>USERNAME</th><th>NAMA</th><th>EMAIL</th><th>ROLE</th><th>GPS MANUAL</th><th>AKSI</th></tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.username || "-"}</td>
                    <td><strong>{user.nama || "-"}</strong></td>
                    <td>{user.email || "-"}</td>
                    <td><span className="user-role">{user.role || "-"}</span></td>
                    <td>{user.role?.toLowerCase() === "enumerator" && user.manualGpsEnabled ? "Aktif" : "-"}</td>
                    <td>
                      <button className="row-action" onClick={() => onEdit(user)} aria-label={`Edit ${user.username || "user"}`}>✎</button>
                      <button type="button" className="row-action row-action-danger" onClick={() => onDelete(user)} disabled={!user.id || currentUserIds.includes(user.id)} aria-label={`Hapus ${user.username || "user"}`}>×</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
