import { api } from "./client";
import type { ConceptMasteryOverview } from "./types";

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  _count: { spaces: number };
}

export interface AdminUserDetail {
  user: { id: string; email: string; name: string; isAdmin: boolean; createdAt: string };
  spaces: {
    id: string;
    name: string;
    projects: { id: string; name: string; _count: { materials: number; concepts: number } }[];
  }[];
  recentActivity: { id: string; type: string; payload: unknown; createdAt: string }[];
  recentQuizAttempts: {
    id: string;
    answer: string;
    score: number | null;
    createdAt: string;
    quizQuestion: { prompt: string; concept: { name: string } };
  }[];
  masteryByProject: { projectId: string; projectName: string; mastery: ConceptMasteryOverview[] }[];
  aiUsageByFeature: { feature: string; count: number; avgLatencyMs: number | null; estimatedCost: number }[];
}

export interface AdminActivityEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  user: { id: string; email: string; name: string };
  project: { id: string; name: string } | null;
}

export interface AdminActivityFilters {
  userId?: string;
  projectId?: string;
  type?: string;
  from?: string;
  to?: string;
  take?: number;
  skip?: number;
}

export interface AdminAiUsageFeature {
  feature: string;
  successCount: number;
  failureCount: number;
  totalCalls: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
}

export interface AdminAiUsageFailure {
  id: string;
  feature: string;
  provider: string;
  model: string;
  errorMessage: string | null;
  createdAt: string;
  user: { id: string; email: string } | null;
  project: { id: string; name: string } | null;
}

export interface AdminEvalResult {
  key: string;
  label: string;
  available: boolean;
  data: { ranAt: string; passCount: number; total: number; results: unknown[] } | null;
}

// `new URLSearchParams({ foo: undefined })` stringifies the value to the literal text
// "undefined" rather than omitting the key — silently turning "no filter" into a real
// filter that matches nothing. Strip undefined/empty values before building the query.
function toQueryString<T extends object>(params: T): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "",
  );
  return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const adminApi = {
  listUsers: (params: { search?: string; take?: number; skip?: number } = {}) =>
    api.get<{ users: AdminUserListItem[]; total: number }>(`/admin/users?${toQueryString(params)}`),
  getUserDetail: (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`),
  listActivity: (filters: AdminActivityFilters = {}) =>
    api.get<{ events: AdminActivityEvent[]; total: number }>(`/admin/activity?${toQueryString(filters)}`),
  getAiUsageSummary: (lookbackDays = 30) =>
    api.get<{ lookbackDays: number; features: AdminAiUsageFeature[] }>(
      `/admin/ai-usage?lookbackDays=${lookbackDays}`,
    ),
  listAiUsageFailures: () => api.get<{ failures: AdminAiUsageFailure[] }>("/admin/ai-usage/failures"),
  getEvalResults: () => api.get<{ evals: AdminEvalResult[] }>("/admin/evals"),
};
