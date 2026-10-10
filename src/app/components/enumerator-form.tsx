import type { User } from "firebase/auth";
import type { FormEvent } from "react";

type EnumeratorFormFieldsProps = {
  user: User;
  profile: { nama?: string; username?: string; organisasi?: string } | null;
  error: string;
  saving: boolean;
  gps: string;
  onUseCurrentLocation: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  locationType: string;
  setLocationType: (value: string) => void;
  locationSubtype: string;
  setLocationSubtype: (value: string) => void;
  statusHotspot: string;
  setStatusHotspot: (value: string) => void;
  hotspotCode: string;
  hotspotCodeLoading: boolean;
  hotspotName: string;
  setHotspotName: (value: string) => void;
  district: string;
  setDistrict: (value: string) => void;
  village: string;
  setVillage: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  districts: Record<string, string[]>;
  visitMode: "initial" | "follow_up";
  setVisitMode: (value: "initial" | "follow_up") => void;
  previousHotspotId: string;
  setPreviousHotspotId: (value: string) => void;
  previousHotspots: Array<{ id: string; hotspotCode?: string; name: string; visitNumber?: number; date: string; area: string; address?: string }>;
  previousVisitsLoading: boolean;
  onSelectPreviousHotspot: (id: string) => void;
  locationSubtypes: Record<string, Array<[string, string]>>;
  revision?: {
    coordinatorReviewNote?: string;
    documents?: Array<{ name: string; fileId?: string; url?: string }>;
    populasiKunci?: string[];
    activityTimes?: string[];
    populationEstimate?: number;
    educated?: number;
    notes?: string;
    informationSourceValue?: string;
    informantPhone?: string;
    activityDescription?: string;
    mappingCondition?: string;
    locationSubtypeOther?: string;
  } | null;
};

const organizations = [
  ["lgi", "Yayasan Lingkar Gagasan Indonesia (LGI)"],
  ["igama", "Yayasan IGAMA"],
  ["wamarapa", "Wamarapa"],
  ["fatayat_nu", "SSR Fatayat NU Jawa Timur (PENASUN)"],
];
export const organizationOptions = organizations;

export function normalizeOrganization(value?: string) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("igama")) return "igama";
  if (normalized.includes("wamarapa")) return "wamarapa";
  if (normalized.includes("fatayat") || normalized.includes("penasun")) return "fatayat_nu";
  if (normalized.includes("lgi") || normalized.includes("lingkar gagasan")) return "lgi";
  return "";
}

export function EnumeratorFormFields({ user, profile, error, saving, gps, onUseCurrentLocation, onClose, onSubmit, locationType, setLocationType, locationSubtype, setLocationSubtype, statusHotspot, setStatusHotspot, hotspotCode, hotspotCodeLoading, hotspotName, setHotspotName, district, setDistrict, village, setVillage, address, setAddress, districts, visitMode, setVisitMode, previousHotspotId, setPreviousHotspotId, previousHotspots, previousVisitsLoading, onSelectPreviousHotspot, locationSubtypes, revision }: EnumeratorFormFieldsProps) {
  const availableSubtypes = locationSubtypes[locationType] || [];
  const organizationValue = normalizeOrganization(profile?.organisasi);
  const organizationLabel = organizations.find(([value]) => value === organizationValue)?.[1] || "Organisasi belum diatur";
  const requiredLabel = (text: string) => (
    <span className="required-label">
      <span>{text}</span>
      <span className="required-indicator" aria-hidden="true">*</span>
    </span>
  );
  return <div className="user-modal-backdrop"><section className="user-modal enumerator-modal" role="dialog" aria-modal="true" aria-labelledby="enumerator-form-title"><div className="user-modal-header"><div><p className="eyebrow">Pendataan lapangan</p><h2 id="enumerator-form-title">{revision ? "Revisi Data Pemetaan" : "Input Data Pemetaan"}</h2><p>{revision ? "Perbaiki isian sesuai catatan Koordinator. Dokumen lama tetap dipakai jika tidak diganti." : "Field mengikuti instrumen pemetaan, agar data tetap konsisten dan mudah dipantau."}</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">x</button></div>{error && <p className="login-error user-modal-error">{error}</p>}{revision?.coordinatorReviewNote && <div className="revision-feedback"><strong>Catatan perbaikan Koordinator</strong><p>{revision.coordinatorReviewNote}</p></div>}<form className={`user-edit-form enumerator-form ${revision ? "enumerator-revision-form" : ""}`} onSubmit={onSubmit} aria-busy={saving}><div className="visit-picker"><label>Jenis pendataan<select name="visitMode" value={visitMode} onChange={(event) => setVisitMode(event.target.value as "initial" | "follow_up")}><option value="initial">Kunjungan 1</option><option value="follow_up">Kunjungan 2</option></select></label>{visitMode === "follow_up" && <label>Pilih hotspot  <select name="previousHotspotId" value={previousHotspotId} onChange={(event) => { setPreviousHotspotId(event.target.value); onSelectPreviousHotspot(event.target.value); }} disabled={previousVisitsLoading || saving} required><option value="">{previousVisitsLoading ? "Memuat riwayat hotspot..." : "Pilih hotspot untuk kunjungan 2"}</option>{previousHotspots.map((hotspot) =>   <option key={hotspot.id} value={hotspot.id}>{hotspot.hotspotCode || "Tanpa kode"} - {hotspot.name} · Kunjungan {hotspot.visitNumber || 1} ({hotspot.date})</option>)}  </select></label>}</div>  <p className="form-wide visit-note">{visitMode === "initial" ? "Kunjungan 1 membuat catatan awal hotspot. Jika hotspot sudah memiliki riwayat, pilih Kunjungan 2." : "Kunjungan 2 membuat catatan baru yang ditautkan ke kunjungan sebelumnya; data kunjungan sebelumnya tetap tersimpan."}</p><p className="form-section-title form-wide">A. Informasi Pelaksanaan</p><label>Nama Enumerator<input value={profile?.nama || user.email || ""} readOnly /></label><label>Organisasi / Komunitas Pelaksana<input value={organizationLabel} readOnly /><input type="hidden" name="organisasi" value={organizationValue} /></label><p className="form-section-title form-wide">B. Identitas Hotspot</p><label>{requiredLabel("Kode Hotspot")}<input name="kodeHotspot" value={hotspotCode} placeholder={hotspotCodeLoading ? "Membuat kode hotspot..." : "Terisi otomatis setelah identitas lokasi lengkap"} readOnly required /></label><label>{requiredLabel("Nama Hotspot")}<input name="namaHotspot" value={hotspotName} onChange={(event) => setHotspotName(event.target.value)} required /></label><label>{requiredLabel("Kecamatan")}<select name="kecamatan" value={district} onChange={(event) => { setDistrict(event.target.value); setVillage(""); }} required><option value="">Pilih kecamatan</option>{Object.keys(districts).map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>{requiredLabel("Kelurahan")}<select name="kelurahan" value={village} onChange={(event) => setVillage(event.target.value)} disabled={!district} required><option value="">{district ? "Pilih kelurahan" : "Pilih kecamatan dulu"}</option>{(districts[district] || []).map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label className="form-wide">{requiredLabel("Alamat atau Deskripsi Lokasi")}<textarea name="alamat" value={address} onChange={(event) => setAddress(event.target.value)} rows={2} required /></label><label className="form-wide">{requiredLabel("Titik Koordinat GPS")}<div className="gps-input"><input value={gps} placeholder="Tekan Gunakan GPS" readOnly required /><button type="button" className="button button-secondary" onClick={onUseCurrentLocation}>Gunakan GPS</button></div><small>Koordinat diambil dari lokasi perangkat.</small></label>{revision && <p className="form-wide revision-document-note">Dokumen tersimpan: {revision.documents?.length || 0}. Pilih file hanya jika ingin mengganti foto terkait.</p>}<label className="form-wide">{revision ? "Ganti Foto Dokumentasi 1" : requiredLabel("Foto Dokumentasi 1")}<input name="document" type="file" accept="image/*" required={!revision} /></label><label className="form-wide">{revision ? "Ganti Foto Dokumentasi 2" : requiredLabel("Foto Dokumentasi 2")}<input name="document2" type="file" accept="image/*" required={!revision} /></label><label className="form-wide">{revision ? "Ganti Foto Dokumentasi 3" : "Foto Dokumentasi 3"}<input name="document3" type="file" accept="image/*" /></label><p className="form-section-title form-wide">C. Karakteristik Hotspot</p><label>{requiredLabel("Status Hotspot")}<select name="statusHotspot" value={statusHotspot} onChange={(event) => setStatusHotspot(event.target.value)} required><option value="">Pilih status</option><option value="aktif">Aktif</option><option value="baru">Baru</option><option value="tidak_aktif">Tidak Aktif</option><option value="perlu_verifikasi">Perlu Verifikasi Lanjutan</option></select></label><fieldset><legend><span className="required-label"><span>Kategori Populasi Kunci</span><span className="required-indicator" aria-hidden="true">*</span></span></legend><div className="checkbox-grid">{[["lsl", "LSL"], ["transgender", "Transgender"], ["idu", "IDU / PWID"], ["pspl___tl__pekerja_seks_perempuan", "PSPL / TL"]].map(([value, label]) => <label key={value}><input type="checkbox" name="populasiKunci" value={value} defaultChecked={revision?.populasiKunci?.includes(value)} /> {label}</label>)}</div></fieldset><label>{requiredLabel("Tipe Lokasi Utama")}<select name="tipeLokasi" value={locationType} onChange={(event) => { setLocationType(event.target.value); setLocationSubtype(""); }} required><option value="">Pilih tipe lokasi</option><option value="ruang_publik">Ruang Publik / Area Terbuka / Jalanan</option><option value="tempat_makan_hiburan">Tempat Makan / Nongkrong / Hiburan</option><option value="akomodasi_private">Akomodasi / Private Venue</option><option value="perawatan_kebugaran">Perawatan & Kebugaran</option><option value="platform_virtual">Platform Virtual / Online</option></select></label><label>{requiredLabel("Detail Sub-Tipe Lokasi")}<select name="subTipeLokasi" value={locationSubtype} onChange={(event) => setLocationSubtype(event.target.value)} required><option value="">{locationType ? "Pilih sub-tipe lokasi" : "Pilih tipe utama dulu"}</option>{availableSubtypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{(locationSubtype === "lainnya" || locationSubtype.endsWith("_lainnya")) && <label>{requiredLabel("Keterangan Sub-Tipe Lokasi Lainnya")}<input name="tipeLokasiLainnya" defaultValue={revision?.locationSubtypeOther || ""} required /></label>}<fieldset><legend><span className="required-label"><span>Waktu Aktivitas Dominan</span><span className="required-indicator" aria-hidden="true">*</span></span></legend><div className="checkbox-grid">{[["pagi", "Pagi"], ["siang", "Siang"], ["sore", "Sore"], ["malam", "Malam"]].map(([value, label]) => <label key={value}><input type="checkbox" name="waktuAktivitas" value={value} defaultChecked={revision?.activityTimes?.includes(value)} /> {label}</label>)}</div></fieldset><label>Jumlah Populasi<input name="estimasiJumlahPopulasi" type="number" min="0" defaultValue={revision?.populationEstimate ?? 0} /></label><label>Jumlah Diedukasi<input name="jumlahDiedukasi" type="number" min="0" defaultValue={revision?.educated ?? 0} /></label><label className="form-wide">Catatan Tambahan Temuan Lapangan<textarea name="catatan" rows={2} defaultValue={revision?.notes || ""} /></label><p className="form-section-title form-wide">D. Informasi Hasil Pemetaan</p><label>{requiredLabel("Sumber Informasi")}<select name="sumberInformasi" defaultValue={revision?.informationSourceValue || ""} required><option value="">Pilih sumber</option><option value="populasi_kunci">Populasi kunci</option><option value="tokoh_kunci">Tokoh kunci</option><option value="observasi">Observasi Lapangan Langsung</option><option value="lainnya">Lainnya</option></select></label><label>No. HP Informan<input name="noHpInforman" type="tel" pattern="[0-9+]{9,15}" defaultValue={revision?.informantPhone || ""} /></label><label>{requiredLabel("Keterangan Informan")}<input name="keteranganAktivitas" defaultValue={revision?.activityDescription || ""} required /></label><label className="form-wide">{requiredLabel("Kondisi Hotspot Saat Pemetaan")}<textarea name="kondisiSaatPemetaan" rows={2} defaultValue={revision?.mappingCondition || ""} required /></label>{saving && <div className="form-saving-indicator"><span className="form-saving-brand" aria-hidden="true" /><strong>Mengirim data...</strong><small>Foto sedang diunggah dan data sedang disimpan.</small><i className="form-saving-track" aria-hidden="true" /></div>}<div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : revision ? "Simpan Revisi" : "Simpan Data Pemetaan"}</button></div></form></section></div>;
}
