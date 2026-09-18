import * as React from "react";
import { Link } from "react-router-dom";
import { dashboardApi } from "@/api/mastery";
import type { DashboardData, MasteryTrend } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TREND_VARIANT: Record<MasteryTrend, "success" | "muted" | "warning" | "default"> = {
  improving: "success",
  stable: "muted",
  "needs-attention": "warning",
  new: "default",
  "insufficient-data": "muted",
};

export function HomeDashboardPage() {
  const [data, setData] = React.useState<DashboardData | null>(null);

  React.useEffect(() => {
    dashboardApi.get().then(setData);
  }, []);

  if (!data) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const { continueLearning, recentProjects, overallProgress, areasNeedingAttention, recentRecommendations } = data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Home</h1>

      {continueLearning ? (
        <Card>
          <CardHeader>
            <CardTitle>Continue learning</CardTitle>
            <CardDescription>{continueLearning.space?.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium">{continueLearning.name}</p>
              {continueLearning.description && (
                <p className="text-sm text-muted-foreground">{continueLearning.description}</p>
              )}
            </div>
            <Link to={`/projects/${continueLearning.id}`}>
              <Button>Continue</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No projects yet.{" "}
            <Link to="/spaces" className="text-primary underline">
              Create a Space
            </Link>{" "}
            to get started.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Concepts tracked" value={overallProgress.conceptsTracked} />
        <StatTile
          label="Average mastery"
          value={overallProgress.averageScore != null ? `${overallProgress.averageScore}` : "—"}
        />
        <StatTile label="Improving" value={overallProgress.improving} />
        <StatTile label="Needs attention" value={overallProgress.needsAttention} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {recentProjects.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">No projects yet.</p>
            )}
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between py-2 text-sm hover:underline"
              >
                <span>{project.name}</span>
                <span className="text-muted-foreground">{project.space?.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Areas needing attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {areasNeedingAttention.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">Nothing flagged right now.</p>
            )}
            {areasNeedingAttention.map((c) => (
              <div key={`${c.projectId}-${c.conceptId}`} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{c.conceptName}</p>
                  <p className="text-xs text-muted-foreground">{c.projectName}</p>
                </div>
                <Badge variant={TREND_VARIANT[c.trend]}>{c.latestScore}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentRecommendations.length === 0 && (
            <p className="text-sm text-muted-foreground">No recommendations yet.</p>
          )}
          {recentRecommendations.map(({ project, recommendation }) => (
            <div key={recommendation.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{recommendation.action}</p>
                <Link to={`/projects/${project.id}`} className="text-xs text-muted-foreground hover:underline">
                  {project.name}
                </Link>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{recommendation.rationale}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
