import * as React from "react";
import { adminApi } from "@/api/admin";
import type {
  AdminUserListItem,
  AdminUserDetail,
  AdminActivityEvent,
  AdminAiUsageFeature,
  AdminAiUsageFailure,
  AdminEvalResult,
} from "@/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "users" | "activity" | "ai-usage" | "jobs" | "evals";

const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "activity", label: "Activity" },
  { key: "ai-usage", label: "AI Usage" },
  { key: "jobs", label: "Job Health" },
  { key: "evals", label: "Evals" },
];

export function AdminPage() {
  const [tab, setTab] = React.useState<Tab>("users");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only — every endpoint here is protected by requireAdmin, checked server-side.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${
              tab === t.key ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "ai-usage" && <AiUsageTab />}
      {tab === "jobs" && <JobsTab />}
      {tab === "evals" && <EvalsTab />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = React.useState<AdminUserListItem[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);

  const load = React.useCallback(() => {
    adminApi.listUsers({ search: search || undefined }).then((res) => setUsers(res.users));
  }, [search]);

  React.useEffect(load, [load]);

  React.useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      return;
    }
    adminApi.getUserDetail(selectedUserId).then(setDetail);
  }, [selectedUserId]);

  if (selectedUserId) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" onClick={() => setSelectedUserId(null)}>
          &larr; All users
        </Button>
        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <UserDetailView detail={detail} />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-col divide-y divide-border">
          {users?.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className="flex items-center justify-between py-2 text-left text-sm hover:bg-muted/50"
            >
              <div>
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-muted-foreground">{u.email}</span>
              </div>
              <div className="flex items-center gap-2">
                {u.isAdmin && <Badge>Admin</Badge>}
                <span className="text-xs text-muted-foreground">{u._count.spaces} spaces</span>
              </div>
            </button>
          ))}
          {users?.length === 0 && <p className="py-2 text-sm text-muted-foreground">No users found.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function UserDetailView({ detail }: { detail: AdminUserDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {detail.user.name} {detail.user.isAdmin && <Badge className="ml-2">Admin</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{detail.user.email}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spaces &amp; Projects</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.spaces.map((s) => (
            <div key={s.id}>
              <p className="text-sm font-medium">{s.name}</p>
              {s.projects.map((p) => (
                <p key={p.id} className="pl-3 text-xs text-muted-foreground">
                  {p.name} — {p._count.materials} materials, {p._count.concepts} concepts
                </p>
              ))}
            </div>
          ))}
          {detail.spaces.length === 0 && <p className="text-sm text-muted-foreground">No spaces yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mastery by project</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.masteryByProject.map((mp) => (
            <div key={mp.projectId}>
              <p className="text-sm font-medium">{mp.projectName}</p>
              {mp.mastery.map((c) => (
                <p key={c.conceptId} className="pl-3 text-xs text-muted-foreground">
                  {c.conceptName}: {c.latestScore} ({c.trend})
                </p>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent quiz attempts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {detail.recentQuizAttempts.map((a) => (
            <div key={a.id} className="py-2 text-sm">
              <p>{a.quizQuestion.concept.name}</p>
              <p className="text-xs text-muted-foreground">
                Score {a.score ?? "N/A"} — {new Date(a.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {detail.recentQuizAttempts.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No quiz attempts yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {detail.recentActivity.map((e) => (
            <div key={e.id} className="py-1.5 text-xs text-muted-foreground">
              {e.type} — {new Date(e.createdAt).toLocaleString()}
            </div>
          ))}
          {detail.recentActivity.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No activity yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI usage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {detail.aiUsageByFeature.map((f) => (
            <p key={f.feature} className="text-sm">
              {f.feature}: {f.count} calls, avg {f.avgLatencyMs ?? "—"}ms
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab() {
  const [events, setEvents] = React.useState<AdminActivityEvent[] | null>(null);
  const [type, setType] = React.useState("");

  const load = React.useCallback(() => {
    adminApi.listActivity({ type: type || undefined, take: 50 }).then((res) => setEvents(res.events));
  }, [type]);

  React.useEffect(load, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform activity feed</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input placeholder="Filter by event type (e.g. tutor_message)" value={type} onChange={(e) => setType(e.target.value)} />
        <div className="flex flex-col divide-y divide-border">
          {events?.map((e) => (
            <div key={e.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.type}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.user.name} ({e.user.email}) {e.project && `— ${e.project.name}`}
              </p>
            </div>
          ))}
          {events?.length === 0 && <p className="py-2 text-sm text-muted-foreground">No activity found.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AiUsageTab() {
  const [features, setFeatures] = React.useState<AdminAiUsageFeature[] | null>(null);
  const [failures, setFailures] = React.useState<AdminAiUsageFailure[] | null>(null);

  React.useEffect(() => {
    adminApi.getAiUsageSummary(30).then((res) => setFeatures(res.features));
    adminApi.listAiUsageFailures().then((res) => setFailures(res.failures));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>AI usage by feature (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4">Feature</th>
                <th className="py-2 pr-4">Calls</th>
                <th className="py-2 pr-4">Success rate</th>
                <th className="py-2 pr-4">Avg latency</th>
                <th className="py-2 pr-4">Tokens (in/out)</th>
                <th className="py-2 pr-4">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {features?.map((f) => (
                <tr key={f.feature} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{f.feature}</td>
                  <td className="py-2 pr-4">{f.totalCalls}</td>
                  <td className="py-2 pr-4">
                    {f.successRate != null ? (
                      <Badge variant={f.successRate === 1 ? "success" : f.successRate > 0.8 ? "warning" : "destructive"}>
                        {Math.round(f.successRate * 100)}%
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">{f.avgLatencyMs != null ? `${f.avgLatencyMs}ms` : "—"}</td>
                  <td className="py-2 pr-4">
                    {f.totalInputTokens} / {f.totalOutputTokens}
                  </td>
                  <td className="py-2 pr-4">${f.estimatedCost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {features?.length === 0 && <p className="py-2 text-sm text-muted-foreground">No AI usage yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent failures</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {failures?.map((f) => (
            <div key={f.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {f.feature} ({f.provider}/{f.model})
                </span>
                <span className="text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-destructive">{f.errorMessage}</p>
              {f.user && (
                <p className="text-xs text-muted-foreground">
                  {f.user.email} {f.project && `— ${f.project.name}`}
                </p>
              )}
            </div>
          ))}
          {failures?.length === 0 && <p className="py-2 text-sm text-muted-foreground">No failures recorded.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function JobsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Background job health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Job runs (success/fail/retry counts) per queue — material-processing, mastery-update,
          recommendation-generation — are served by Bull Board, mounted admin-only at{" "}
          <code>/api/admin/queues</code>.
        </p>
        <a href="/api/admin/queues" target="_blank" rel="noreferrer">
          <Button>Open job dashboard</Button>
        </a>
      </CardContent>
    </Card>
  );
}

function EvalsTab() {
  const [evals, setEvals] = React.useState<AdminEvalResult[] | null>(null);

  React.useEffect(() => {
    adminApi.getEvalResults().then((res) => setEvals(res.evals));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {evals?.map((e) => (
        <Card key={e.key}>
          <CardHeader>
            <CardTitle>{e.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {!e.available || !e.data ? (
              <p className="text-sm text-muted-foreground">
                No results yet — run <code>npm run eval:{e.key}</code>.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={e.data.passCount === e.data.total ? "success" : "warning"}>
                    {e.data.passCount}/{e.data.total} passed
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Last run: {new Date(e.data.ranAt).toLocaleString()}
                  </span>
                </div>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(e.data.results, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
