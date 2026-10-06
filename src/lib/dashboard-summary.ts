export const workflowStages = [
  "submitted",
  "supervisor_review",
  "coordinator_review",
  "analyst_review",
  "finalized",
  "needs_revision",
] as const;

export type WorkflowStage = (typeof workflowStages)[number];

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
