import { api } from "./client";
import type { Space, Project } from "./types";

export const spacesApi = {
  list: () => api.get<{ spaces: Space[] }>("/spaces"),
  create: (data: { name: string; description?: string }) =>
    api.post<{ space: Space }>("/spaces", data),
  get: (id: string) => api.get<{ space: Space & { projects: Project[] } }>(`/spaces/${id}`),
  listProjects: (spaceId: string) => api.get<{ projects: Project[] }>(`/spaces/${spaceId}/projects`),
  createProject: (spaceId: string, data: { name: string; description?: string; goal?: string }) =>
    api.post<{ project: Project }>(`/spaces/${spaceId}/projects`, data),
};
