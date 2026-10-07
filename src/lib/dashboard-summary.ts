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
  qc: {
    valid: number;
    pending: number;
    needsRevision: number;
  };
  stages: Record<WorkflowStage, number>;
};

export type DashboardSummary = {
  total: number;
  active: number;
  pendingQc: number;
  hivPositive: number;
  hivTests: number;
  enumerators: EnumeratorProgressSummary[];
};
