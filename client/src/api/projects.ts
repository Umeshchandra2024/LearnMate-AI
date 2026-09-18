import { api } from "./client";
import type { Project, Material } from "./types";

export const projectsApi = {
  get: (id: string) => api.get<{ project: Project }>(`/projects/${id}`),
  listMaterials: (projectId: string) =>
    api.get<{ materials: Material[] }>(`/projects/${projectId}/materials`),
  uploadMaterial: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ material: Material }>(`/projects/${projectId}/materials`, form);
  },
  retryMaterial: (materialId: string) =>
    api.post<{ material: Material }>(`/materials/${materialId}/retry`),
};
