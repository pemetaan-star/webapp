import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { Timestamp, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  normalizeWorkflowStage,
  type AnalyticsHotspotSummary,
  type AnalyticsDistributionItem,
  type AnalyticsVisitGroup,
  type AnalyticsVisitSummary,
  type DashboardSummary,
  type EnumeratorProgressSummary,
  type PopulationKeyMetrics,
  type WorkflowStage,
} from "@/lib/dashboard-summary";

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

type MutableVisitSummary = {
  total: number;
  hotspotStatuses: Map<string, number>;
  locationTypes: Map<string, number>;
  locationSubtypes: Map<string, number>;
  kecamatans: Map<string, number>;
  kelurahans: Map<string, number>;
};

type LatestHotspotVisit = {
  visitNumber: number;
  timestamp: number;
  data: Record<string, unknown>;
};

type MutableHotspotSummary = {
  total: number;
  missingCodeVisits: number;
  visitFrequency: {
    once: number;
    twice: number;
    threeOrMore: number;
    repeated: number;
  };
  hotspotStatuses: Map<string, number>;
  qcStatuses: Map<string, number>;
  locationTypes: Map<string, number>;
  locationSubtypes: Map<string, number>;
  kecamatans: Map<string, number>;
  kelurahans: Map<string, number>;
  populationKeys: Map<string, number>;
};

function createPopulationMetrics(): Record<AnalyticsVisitGroup, PopulationKeyMetrics> {
  const emptyMetrics = (): PopulationKeyMetrics => ({ kdCount: 0, estimatedPopulation: 0, educated: 0 });
  return { visit1: emptyMetrics(), visit2: emptyMetrics(), later: emptyMetrics() };
}

function createMutableVisitSummary(): MutableVisitSummary {
  return {
    total: 0,
    hotspotStatuses: new Map(),
    locationTypes: new Map(),
    locationSubtypes: new Map(),
    kecamatans: new Map(),
    kelurahans: new Map(),
  };
}

function createMutableHotspotSummary(): MutableHotspotSummary {
  return {
    total: 0,
    missingCodeVisits: 0,
    visitFrequency: { once: 0, twice: 0, threeOrMore: 0, repeated: 0 },
    hotspotStatuses: new Map(),
    qcStatuses: new Map(),
    locationTypes: new Map(),
    locationSubtypes: new Map(),
    kecamatans: new Map(),
    kelurahans: new Map(),
    populationKeys: new Map(),
  };
}

function toHotspotSummary(summary: MutableHotspotSummary): AnalyticsHotspotSummary {
  return {
    total: summary.total,
    missingCodeVisits: summary.missingCodeVisits,
    visitFrequency: summary.visitFrequency,
    hotspotStatuses: toDistributionItems(summary.hotspotStatuses),
    qcStatuses: toDistributionItems(summary.qcStatuses),
    locationTypes: toDistributionItems(summary.locationTypes),
    locationSubtypes: toDistributionItems(summary.locationSubtypes),
    kecamatans: toDistributionItems(summary.kecamatans),
    kelurahans: toDistributionItems(summary.kelurahans),
    populationKeys: toDistributionItems(summary.populationKeys),
  };
}

function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value !== "string") return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function incrementDistribution(counts: Map<string, number>, value: unknown) {
  const label = typeof value === "string" ? value.trim() : "";
  const key = label || "Belum diisi";
  counts.set(key, (counts.get(key) || 0) + 1);
}

function toDistributionItems(counts: Map<string, number>): AnalyticsDistributionItem[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, "id"));
}

function toVisitSummary(summary: MutableVisitSummary): AnalyticsVisitSummary {
  return {
    total: summary.total,
    hotspotStatuses: toDistributionItems(summary.hotspotStatuses),
    locationTypes: toDistributionItems(summary.locationTypes),
    locationSubtypes: toDistributionItems(summary.locationSubtypes),
    kecamatans: toDistributionItems(summary.kecamatans),
    kelurahans: toDistributionItems(summary.kelurahans),
  };
}

function getPopulationKeys(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const keys = [...new Set(values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
  return keys.length ? keys : ["Belum diisi"];
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

    const analyticsVisits: Record<AnalyticsVisitGroup, MutableVisitSummary> = {
      visit1: createMutableVisitSummary(),
      visit2: createMutableVisitSummary(),
      later: createMutableVisitSummary(),
    };
    const latestHotspotVisits = new Map<string, LatestHotspotVisit>();
    let missingHotspotCodeVisits = 0;
    const populationKeys = new Map<string, Record<AnalyticsVisitGroup, PopulationKeyMetrics>>();
    const enumerators = new Map<string, EnumeratorProgressSummary>();
    const summary: DashboardSummary = {
      total: 0,
      active: 0,
      pendingQc: 0,
      hivPositive: 0,
      hivTests: 0,
      enumerators: [],
      analytics: {
        hotspots: toHotspotSummary(createMutableHotspotSummary()),
        populationKeys: [],
        visits: {
          visit1: toVisitSummary(analyticsVisits.visit1),
          visit2: toVisitSummary(analyticsVisits.visit2),
          later: toVisitSummary(analyticsVisits.later),
        },
      },
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

        const rawVisitNumber = Number(data.visitNumber);
        const visitNumber = Number.isInteger(rawVisitNumber) && rawVisitNumber > 0
          ? rawVisitNumber
          : data.visitType === "follow_up" ? 2 : 1;
        const hotspotCode = String(data.kodeHotspot || "").trim().toUpperCase();
        if (hotspotCode) {
          const visitTimestamp = timestampMillis(data.updatedAt)
            || timestampMillis(data.visitedAt)
            || timestampMillis(data.createdAt);
          const existingVisit = latestHotspotVisits.get(hotspotCode);
          if (
            !existingVisit
            || visitNumber > existingVisit.visitNumber
            || (visitNumber === existingVisit.visitNumber && visitTimestamp > existingVisit.timestamp)
          ) {
            latestHotspotVisits.set(hotspotCode, { visitNumber, timestamp: visitTimestamp, data });
          }
        } else {
          missingHotspotCodeVisits += 1;
        }
        const visitGroup: AnalyticsVisitGroup = visitNumber === 1 ? "visit1" : visitNumber === 2 ? "visit2" : "later";
        const visitSummary = analyticsVisits[visitGroup];
        visitSummary.total += 1;
        incrementDistribution(visitSummary.hotspotStatuses, data.statusHotspot);
        incrementDistribution(visitSummary.locationTypes, data.tipeLokasi);
        incrementDistribution(visitSummary.locationSubtypes, data.subTipeLokasi);
        incrementDistribution(visitSummary.kecamatans, data.kecamatan);
        incrementDistribution(visitSummary.kelurahans, data.kelurahan);

        const estimatedPopulation = numberOrZero(data.estimasiJumlahPopulasi);
        const educated = numberOrZero(data.jumlahDiedukasi);
        for (const key of getPopulationKeys(data.populasiKunci)) {
          const metrics = populationKeys.get(key) || createPopulationMetrics();
          metrics[visitGroup].kdCount += 1;
          metrics[visitGroup].estimatedPopulation += estimatedPopulation;
          metrics[visitGroup].educated += educated;
          populationKeys.set(key, metrics);
        }
      });

      cursor = page.docs.length === PAGE_SIZE ? page.docs.at(-1) : undefined;
    } while (cursor);

    summary.enumerators = [...enumerators.values()].sort((first, second) =>
      second.total - first.total || first.name.localeCompare(second.name, "id"),
    );
    const hotspotSummary = createMutableHotspotSummary();
    hotspotSummary.total = latestHotspotVisits.size;
    hotspotSummary.missingCodeVisits = missingHotspotCodeVisits;
    latestHotspotVisits.forEach(({ data }) => {
      incrementDistribution(hotspotSummary.hotspotStatuses, data.statusHotspot);
      incrementDistribution(hotspotSummary.qcStatuses, data.qcStatus || "pending");
      incrementDistribution(hotspotSummary.locationTypes, data.tipeLokasi);
      incrementDistribution(hotspotSummary.locationSubtypes, data.subTipeLokasi);
      incrementDistribution(hotspotSummary.kecamatans, data.kecamatan);
      incrementDistribution(hotspotSummary.kelurahans, data.kelurahan);
      getPopulationKeys(data.populasiKunci).forEach((key) => {
        hotspotSummary.populationKeys.set(key, (hotspotSummary.populationKeys.get(key) || 0) + 1);
      });
    });
    latestHotspotVisits.forEach(({ visitNumber }) => {
      if (visitNumber === 1) hotspotSummary.visitFrequency.once += 1;
      else if (visitNumber === 2) hotspotSummary.visitFrequency.twice += 1;
      else hotspotSummary.visitFrequency.threeOrMore += 1;
      if (visitNumber >= 2) hotspotSummary.visitFrequency.repeated += 1;
    });
    summary.analytics = {
      hotspots: toHotspotSummary(hotspotSummary),
      populationKeys: [...populationKeys.entries()]
        .map(([key, visits]) => ({ key, visits }))
        .sort((first, second) => first.key.localeCompare(second.key, "id")),
      visits: {
        visit1: toVisitSummary(analyticsVisits.visit1),
        visit2: toVisitSummary(analyticsVisits.visit2),
        later: toVisitSummary(analyticsVisits.later),
      },
    };
    return Response.json(summary);
  } catch {
    return Response.json({ error: "Ringkasan dashboard gagal dimuat. Silakan coba lagi." }, { status: 500 });
  }
}
