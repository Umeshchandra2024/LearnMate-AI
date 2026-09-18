import { api } from "./client";
import type { Conversation, Message } from "./types";

export const conversationsApi = {
  listForProject: (projectId: string) =>
    api.get<{ conversations: Conversation[] }>(`/projects/${projectId}/conversations`),
  create: (projectId: string) =>
    api.post<{ conversation: Conversation }>(`/projects/${projectId}/conversations`),
  get: (id: string) => api.get<{ conversation: Conversation & { messages: Message[] } }>(`/conversations/${id}`),
  sendMessage: (id: string, content: string) =>
    api.post<{ userMessage: Message; assistantMessage: Message }>(`/conversations/${id}/messages`, {
      content,
    }),
};
