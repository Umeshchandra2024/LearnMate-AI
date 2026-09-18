import { api } from "./client";
import type { User } from "./types";

export const authApi = {
  signup: (data: { name: string; email: string; password: string }) =>
    api.post<{ user: User }>("/auth/signup", data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: User }>("/auth/login", data),
  logout: () => api.post<void>("/auth/logout"),
  me: () => api.get<{ user: User }>("/auth/me"),
};
