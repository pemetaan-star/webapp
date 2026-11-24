export const workflowStages = [
  "submitted",
  "coordinator_review",
  "awaiting_enumerator_signature",
  "awaiting_coordinator_completion",
  "analyst_review",
  "finalized",
  "needs_revision",
] as const;

export type WorkflowStage = (typeof workflowStages)[number];

export const workflowStageLabels: Record<WorkflowStage, string> = {
  submitted: "Menunggu supervisi Koordinator",
  coordinator_review: "Supervisi Koordinator",
  awaiting_enumerator_signature: "Menunggu tanda tangan Enumerator",
  awaiting_coordinator_completion: "Menunggu penyelesaian Koordinator",
  analyst_review: "Pemeriksaan Data Analis",
  finalized: "Database final",
  needs_revision: "Perlu perbaikan",
};

export function getWorkflowStageLabel(value: unknown): string | undefined {
  const stageValue = String(value || "");
  const normalizedStage = stageValue === "supervisor_review" ? "coordinator_review" : stageValue;
  const stage = workflowStages.find((candidate) => candidate === normalizedStage);
  return stage ? workflowStageLabels[stage] : undefined;
}

export function normalizeWorkflowStage(value: unknown): WorkflowStage {
  const stage = String(value || "submitted");
  if (stage === "supervisor_review") return "coordinator_review";
  return workflowStages.includes(stage as WorkflowStage) ? stage as WorkflowStage : "submitted";
}

export function canReviewWorkflowStage(
  role: "admin" | "coordinator" | "analyst" | "other",
  stage: WorkflowStage,
) {
  if (role === "admin") return stage !== "finalized" && stage !== "awaiting_enumerator_signature" && stage !== "awaiting_coordinator_completion";
  if (role === "coordinator") {
    return ["submitted", "coordinator_review", "needs_revision"].includes(stage);
  }
  if (role === "analyst") return stage === "analyst_review";
  return false;
}

export type EnumeratorProgressSummary = {
  id: string;
  name: string;
  username: string;
  total: number;
  uniqueHotspots: number;
  qc: {
    valid: number;
    pending: number;
    needsRevision: number;
  };
  stages: Record<WorkflowStage, number>;
};

export type AnalyticsVisitGroup = "visit1" | "visit2" | "later";

export type AnalyticsDistributionItem = {
  label: string;
  count: number;
};

export type PopulationKeyMetrics = {
  kdCount: number;
  estimatedPopulation: number;
  educated: number;
};

export type AnalyticsVisitSummary = {
  total: number;
  hotspotStatuses: AnalyticsDistributionItem[];
  locationTypes: AnalyticsDistributionItem[];
  locationSubtypes: AnalyticsDistributionItem[];
  kecamatans: AnalyticsDistributionItem[];
  kelurahans: AnalyticsDistributionItem[];
};

export type AnalyticsHotspotSummary = {
  total: number;
  missingCodeVisits: number;
  visitFrequency: {
    once: number;
    twice: number;
    threeOrMore: number;
    repeated: number;
  };
  hotspotStatuses: AnalyticsDistributionItem[];
  qcStatuses: AnalyticsDistributionItem[];
  locationTypes: AnalyticsDistributionItem[];
  locationSubtypes: AnalyticsDistributionItem[];
  kecamatans: AnalyticsDistributionItem[];
  kelurahans: AnalyticsDistributionItem[];
  populationKeys: AnalyticsDistributionItem[];
};

export type DashboardAnalyticsSummary = {
  hotspots: AnalyticsHotspotSummary;
  populationKeys: Array<{
    key: string;
    visits: Record<AnalyticsVisitGroup, PopulationKeyMetrics>;
  }>;
  visits: Record<AnalyticsVisitGroup, AnalyticsVisitSummary>;
};

export type DashboardSummary = {
  total: number;
  hotspots: number;
  active: number;
  pendingQc: number;
  hivPositive: number;
  hivTests: number;
  enumerators: EnumeratorProgressSummary[];
  analytics: DashboardAnalyticsSummary;
};
