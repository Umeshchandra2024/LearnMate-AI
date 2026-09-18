import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { conversationsApi } from "@/api/conversations";
import { projectsApi } from "@/api/projects";
import type { Message, Project } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/api/client";

export function TutorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = React.useState<Project | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!projectId) return;
    projectsApi.get(projectId).then((res) => setProject(res.project));

    conversationsApi.listForProject(projectId).then(async (res) => {
      const existing = res.conversations[0];
      const conversation = existing ?? (await conversationsApi.create(projectId)).conversation;
      setConversationId(conversation.id);
      const full = await conversationsApi.get(conversation.id);
      setMessages(full.conversation.messages ?? []);
    });
  }, [projectId]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startNewChat() {
    if (!projectId) return;
    const conversation = (await conversationsApi.create(projectId)).conversation;
    setConversationId(conversation.id);
    setMessages([]);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !input.trim()) return;
    setError(null);
    setSending(true);
    const question = input;
    setInput("");

    // Optimistically show the student's message while waiting for the tutor's reply.
    const optimisticUser: Message = {
      id: `optimistic-${Date.now()}`,
      conversationId,
      role: "USER",
      content: question,
      citations: null,
      sufficientEvidence: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await conversationsApi.sendMessage(conversationId, question);
      setMessages((prev) => [...prev.slice(0, -1), res.userMessage, res.assistantMessage]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get a response");
    } finally {
      setSending(false);
    }
  }

  if (!project) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to={`/projects/${project.id}`} className="text-sm text-muted-foreground hover:underline">
            &larr; {project.name}
          </Link>
          <h1 className="text-2xl font-semibold">Tutor</h1>
        </div>
        <Button variant="outline" onClick={startNewChat}>
          New chat
        </Button>
      </div>

      <Card className="flex h-[65vh] flex-col">
        <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ask a question about this Project's materials to get started.
            </p>
          )}
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="Ask a question about your materials..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending || !conversationId}
        />
        <Button type="submit" disabled={sending || !input.trim() || !conversationId}>
          {sending ? "Thinking..." : "Send"}
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  const insufficientEvidence = !isUser && message.sufficientEvidence === false;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {insufficientEvidence && (
          <Badge variant="warning" className="mb-2">
            Not enough evidence in your materials
          </Badge>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {message.citations.map((c, i) => (
              <span key={i}>
                {c.material}, page {c.page}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
