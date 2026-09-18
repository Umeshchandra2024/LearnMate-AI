import { api } from "./client";
import type { ConceptMasteryOverview, Recommendation, ProjectAnalytics, DashboardData } from "./types";

export const masteryApi = {
  getForProject: (projectId: string) =>
    api.get<{ mastery: ConceptMasteryOverview[] }>(`/projects/${projectId}/mastery`),
};

export const recommendationsApi = {
  listForProject: (projectId: string) =>
    api.get<{ recommendations: Recommendation[] }>(`/projects/${projectId}/recommendations`),
};

export const analyticsApi = {
  getForProject: (projectId: string) => api.get<ProjectAnalytics>(`/projects/${projectId}/analytics`),
};

export const dashboardApi = {
  get: () => api.get<DashboardData>("/dashboard"),
};
