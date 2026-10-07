import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { normalizeWorkflowStage, type DashboardSummary, type EnumeratorProgressSummary, type WorkflowStage } from "@/lib/dashboard-summary";

const PAGE_SIZE = 500;
const emptyStages = (): Record<WorkflowStage, number> => ({
  submitted: 0,
  coordinator_review: 0,
  awaiting_enumerator_signature: 0,
  awaiting_coordinator_completion: 0,
  analyst_review: 0,
  finalized: 0,
  needs_revision: 0,
});

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return Response.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return Response.json({ error: "Sesi tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  }

  const adminDb = getAdminDb();
  let role: string;
  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  } catch {
    return Response.json({ error: "Profil pengguna tidak dapat diverifikasi." }, { status: 500 });
  }

  const isEnumerator = role === "enumerator";
  const canViewAll = role === "admin" || role === "supervisor" || role.includes("koor") || role.includes("dataanalis") || role.includes("dataanalyst");
  if (!isEnumerator && !canViewAll) {
    return Response.json({ error: "Anda tidak memiliki akses ke ringkasan dashboard." }, { status: 403 });
  }

  try {
    let submissionsQuery: Query = adminDb.collection("submissions");
    if (isEnumerator) submissionsQuery = submissionsQuery.where("enumeratorUid", "==", uid);

    const enumerators = new Map<string, EnumeratorProgressSummary>();
    const summary: DashboardSummary = {
      total: 0,
      active: 0,
      pendingQc: 0,
      hivPositive: 0,
      hivTests: 0,
      enumerators: [],
    };
    let cursor: QueryDocumentSnapshot | undefined;

    do {
      let pageQuery = submissionsQuery.orderBy("__name__").limit(PAGE_SIZE);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const page = await pageQuery.get();

      page.docs.forEach((submission) => {
        const data = submission.data();
        const enumeratorUid = String(data.enumeratorUid || "");
        const username = String(data.enumeratorUsername || "").trim();
        const name = String(data.enumeratorName || "").trim() || username || "Nama belum diatur";
        const id = enumeratorUid || username || name.toLowerCase();
        const enumerator = enumerators.get(id) || {
          id,
          name,
          username,
          total: 0,
          qc: { valid: 0, pending: 0, needsRevision: 0 },
          stages: emptyStages(),
        };
        const qcStatus = String(data.qcStatus || "pending").toLowerCase();
        const stage = normalizeWorkflowStage(data.workflowStage);

        summary.total += 1;
        if (data.statusHotspot === "aktif" || data.statusHotspot === "baru") summary.active += 1;
        if (qcStatus === "valid") enumerator.qc.valid += 1;
        else if (qcStatus === "perlu_perbaikan") enumerator.qc.needsRevision += 1;
        else {
          enumerator.qc.pending += 1;
          summary.pendingQc += 1;
        }
        enumerator.total += 1;
        enumerator.stages[stage] += 1;
        summary.hivPositive += numberOrZero(data.jumlahHivPositif);
        summary.hivTests += numberOrZero(data.jumlahTesHiv);
        enumerators.set(id, enumerator);
      });

      cursor = page.docs.length === PAGE_SIZE ? page.docs.at(-1) : undefined;
    } while (cursor);

    summary.enumerators = [...enumerators.values()].sort((first, second) =>
      second.total - first.total || first.name.localeCompare(second.name, "id"),
    );
    return Response.json(summary);
  } catch {
    return Response.json({ error: "Ringkasan dashboard gagal dimuat. Silakan coba lagi." }, { status: 500 });
  }
}
