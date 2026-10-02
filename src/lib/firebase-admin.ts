import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Kredensial Firebase Admin belum dikonfigurasi lengkap.");
}

function normalizePrivateKey(value: string) {
  let normalized = value.trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(normalized);
      normalized = typeof parsed === "string" ? parsed : normalized.slice(1, -1);
    } catch {
      normalized = normalized.slice(1, -1);
    }
  } else if (normalized.startsWith("'") && normalized.endsWith("'")) {
    normalized = normalized.slice(1, -1);
  }

  return normalized.replace(/\\+n/g, "\n").replace(/\r\n/g, "\n").trim();
}

const adminApp = getApps()[0] || initializeApp({
  credential: cert({ projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) }),
  projectId,
});

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return { response: Response.json({ error: "Autentikasi diperlukan." }, { status: 401 }) };
  }

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return { response: Response.json({ error: "Sesi tidak valid atau sudah kedaluwarsa." }, { status: 401 }) };
  }

  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    if (String(profile.get("role") || "").trim().toLowerCase() !== "admin") {
      return { response: Response.json({ error: "Akses hanya untuk admin." }, { status: 403 }) };
    }
  } catch {
    return { response: Response.json({ error: "Profil admin tidak dapat diverifikasi." }, { status: 500 }) };
  }

  return { uid };
}
