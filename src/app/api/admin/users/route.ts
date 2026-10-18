import { getAdminAuth, getAdminDb, requireAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const supportedRoles = new Set(["admin", "data analis", "data analyst", "koordinator", "enumerator"]);
const supportedOrganizations = new Set(["lgi", "igama", "wamarapa", "fatayat_nu"]);

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const adminDb = getAdminDb();
  try {
    const snapshot = await adminDb.collection("user").get();
    const users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    return Response.json({ users });
  } catch {
    return Response.json({ error: "Daftar user tidak dapat dimuat." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
  const role = typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  const organisasi = typeof body?.organisasi === "string" ? body.organisasi.trim() : "";
  const manualGpsEnabled = body?.manualGpsEnabled === true;
  const password = typeof body?.password === "string" ? body.password : "";

  if (body?.manualGpsEnabled !== undefined && typeof body.manualGpsEnabled !== "boolean") {
    return Response.json({ error: "Pengaturan GPS manual tidak valid." }, { status: 400 });
  }
  if (manualGpsEnabled && role !== "enumerator") {
    return Response.json({ error: "Izin GPS manual hanya berlaku untuk Enumerator." }, { status: 400 });
  }
  if (!username || !nama || !email.includes("@") || password.length < 6 || !supportedRoles.has(role) || (role === "enumerator" && !supportedOrganizations.has(organisasi))) {
    return Response.json({ error: "Data user tidak valid. Pilih organisasi untuk enumerator dan gunakan password minimal 6 karakter." }, { status: 400 });
  }

  try {
    const account = await adminAuth.createUser({ email, password, displayName: nama });
    const profile = { username, email, nama, role, organisasi: role === "enumerator" ? organisasi : "", manualGpsEnabled: role === "enumerator" && manualGpsEnabled };
    try {
      await adminDb.collection("user").doc(account.uid).create(profile);
    } catch (error) {
      await adminAuth.deleteUser(account.uid).catch(() => undefined);
      throw error;
    }

    return Response.json({ user: { id: account.uid, ...profile } }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "auth/email-already-exists") return Response.json({ error: "Email sudah digunakan akun lain." }, { status: 409 });
    if (code === "auth/invalid-email" || code === "auth/invalid-password") {
      return Response.json({ error: "Email atau password tidak valid." }, { status: 400 });
    }
    return Response.json({ error: "Akun user gagal dibuat." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
  const role = typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  const organisasi = typeof body?.organisasi === "string" ? body.organisasi.trim() : "";
  const manualGpsEnabled = body?.manualGpsEnabled === true;
  const password = typeof body?.password === "string" ? body.password : "";

  if (body?.password !== undefined && typeof body.password !== "string") {
    return Response.json({ error: "Sandi baru tidak valid." }, { status: 400 });
  }
  if (password.length > 0 && password.length < 6) {
    return Response.json({ error: "Sandi baru minimal 6 karakter." }, { status: 400 });
  }
  if (body?.manualGpsEnabled !== undefined && typeof body.manualGpsEnabled !== "boolean") {
    return Response.json({ error: "Pengaturan GPS manual tidak valid." }, { status: 400 });
  }
  if (manualGpsEnabled && role !== "enumerator") {
    return Response.json({ error: "Izin GPS manual hanya berlaku untuk Enumerator." }, { status: 400 });
  }
  if (!uid || !username || !nama || !email.includes("@") || !supportedRoles.has(role) || (role === "enumerator" && !supportedOrganizations.has(organisasi))) {
    return Response.json({ error: "Data profil atau role tidak valid." }, { status: 400 });
  }
  if (uid === authorization.uid && role !== "admin") {
    return Response.json({ error: "Role admin sendiri tidak dapat diturunkan." }, { status: 400 });
  }

  const profileRef = adminDb.collection("user").doc(uid);
  try {
    const profileSnapshot = await profileRef.get();
    if (!profileSnapshot.exists) return Response.json({ error: "Profil user tidak ditemukan." }, { status: 404 });
    if (String(profileSnapshot.get("role") || "").toLowerCase() === "admin" && role !== "admin") {
      const admins = await adminDb.collection("user").where("role", "==", "admin").limit(2).get();
      if (admins.size < 2) return Response.json({ error: "Admin terakhir tidak dapat diturunkan rolenya." }, { status: 400 });
    }

    await adminAuth.getUser(uid);
    const profileData = {
      username,
      email,
      nama,
      role,
      organisasi: role === "enumerator" ? organisasi : "",
      manualGpsEnabled: role === "enumerator" && manualGpsEnabled,
    };
    await profileRef.update(profileData);
    try {
      await adminAuth.updateUser(uid, {
        email,
        displayName: nama,
        ...(password ? { password } : {}),
      });
    } catch (authError) {
      const previousProfile = profileSnapshot.data() || {};
      const restoredProfile: Record<string, unknown> = {};
      for (const field of Object.keys(profileData)) {
        restoredProfile[field] = Object.hasOwn(previousProfile, field)
          ? previousProfile[field]
          : FieldValue.delete();
      }
      try {
        await profileRef.update(restoredProfile);
      } catch (rollbackError) {
        console.error(
          "[admin/users] Failed to restore profile after Firebase Auth update failed:",
          rollbackError instanceof Error ? rollbackError.message : "Unknown rollback error",
        );
        return Response.json({ error: "Perubahan akun gagal dan profil tidak dapat dipulihkan otomatis. Hubungi administrator." }, { status: 500 });
      }
      throw authError;
    }

    return Response.json({ success: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "auth/user-not-found") return Response.json({ error: "Akun pengguna tidak ditemukan." }, { status: 404 });
    if (code === "auth/email-already-exists") return Response.json({ error: "Email sudah digunakan akun lain." }, { status: 409 });
    if (code === "auth/invalid-password" || code === "auth/weak-password") return Response.json({ error: "Sandi baru tidak memenuhi persyaratan Firebase." }, { status: 400 });
    return Response.json({ error: "Profil user gagal disimpan." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  if (!uid) return Response.json({ error: "UID user wajib diisi." }, { status: 400 });
  if (uid === authorization.uid) return Response.json({ error: "Akun admin yang sedang digunakan tidak dapat dihapus." }, { status: 400 });

  const profileRef = adminDb.collection("user").doc(uid);
  try {
    const profileSnapshot = await profileRef.get();
    if (!profileSnapshot.exists) return Response.json({ error: "Profil user tidak ditemukan." }, { status: 404 });

    const profile = profileSnapshot.data() || {};
    if (String(profile.role || "").toLowerCase() === "admin") {
      const admins = await adminDb.collection("user").where("role", "==", "admin").limit(2).get();
      if (admins.size < 2) return Response.json({ error: "Admin terakhir tidak dapat dihapus." }, { status: 400 });
    }

    await profileRef.delete();
    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") {
        await profileRef.set(profile).catch(() => undefined);
        throw error;
      }
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Akun atau profil pengguna gagal dihapus." }, { status: 500 });
  }
}