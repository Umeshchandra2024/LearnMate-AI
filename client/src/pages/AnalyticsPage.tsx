import * as React from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { analyticsApi } from "@/api/mastery";
import { projectsApi } from "@/api/projects";
import type { Project, ProjectAnalytics } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_BLUE = "#2a78d6"; // single-hue sequential blue, per the app's data-viz palette

export function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = React.useState<Project | null>(null);
  const [analytics, setAnalytics] = React.useState<ProjectAnalytics | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    projectsApi.get(projectId).then((res) => setProject(res.project));
    analyticsApi.getForProject(projectId).then(setAnalytics);
  }, [projectId]);

  if (!project || !analytics) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const quizPerformanceIndexed = analytics.quizPerformance.map((p, i) => ({ attempt: i + 1, score: p.score }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={`/projects/${project.id}`} className="text-sm text-muted-foreground hover:underline">
          &larr; {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Last {analytics.lookbackDays} days</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mastery distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.masteryDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No concepts tracked yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.masteryDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                <XAxis dataKey="conceptName" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="latestScore" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity over time</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.activityOverTime.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analytics.activityOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={CHART_BLUE} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quiz performance trend</CardTitle>
          </CardHeader>
          <CardContent>
            {quizPerformanceIndexed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quiz attempts yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={quizPerformanceIndexed}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                  <XAxis dataKey="attempt" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke={CHART_BLUE} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI usage</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.aiUsage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI calls yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4">Feature</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Calls</th>
                    <th className="py-2 pr-4">Avg latency</th>
                    <th className="py-2 pr-4">Tokens (in/out)</th>
                    <th className="py-2 pr-4">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.aiUsage.map((row) => (
                    <tr key={`${row.feature}-${row.status}`} className="border-b border-border/50">
                      <td className="py-2 pr-4">{row.feature}</td>
                      <td className="py-2 pr-4">{row.status}</td>
                      <td className="py-2 pr-4">{row.count}</td>
                      <td className="py-2 pr-4">{row.avgLatencyMs != null ? `${row.avgLatencyMs}ms` : "—"}</td>
                      <td className="py-2 pr-4">
                        {row.totalInputTokens} / {row.totalOutputTokens}
                      </td>
                      <td className="py-2 pr-4">${row.estimatedCost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
