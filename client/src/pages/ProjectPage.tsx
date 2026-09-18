import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { projectsApi } from "@/api/projects";
import { masteryApi, recommendationsApi } from "@/api/mastery";
import type { ConceptMasteryOverview, Material, MasteryTrend, Project, Recommendation } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/api/client";

const STATUS_VARIANT: Record<Material["status"], "muted" | "warning" | "success" | "destructive"> = {
  QUEUED: "muted",
  PROCESSING: "warning",
  READY: "success",
  FAILED: "destructive",
};

const TREND_VARIANT: Record<MasteryTrend, "success" | "muted" | "warning" | "default"> = {
  improving: "success",
  stable: "muted",
  "needs-attention": "warning",
  new: "default",
  "insufficient-data": "muted",
};

const TREND_LABEL: Record<MasteryTrend, string> = {
  improving: "Improving",
  stable: "Stable",
  "needs-attention": "Needs attention",
  new: "New",
  "insufficient-data": "Not started",
};

const POLL_INTERVAL_MS = 3000;

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = React.useState<Project | null>(null);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [mastery, setMastery] = React.useState<ConceptMasteryOverview[]>([]);
  const [recommendations, setRecommendations] = React.useState<Recommendation[]>([]);

  const refreshMaterials = React.useCallback(() => {
    if (!projectId) return;
    projectsApi.listMaterials(projectId).then((res) => setMaterials(res.materials));
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) return;
    projectsApi.get(projectId).then((res) => setProject(res.project));
    refreshMaterials();
    masteryApi.getForProject(projectId).then((res) => setMastery(res.mastery));
    recommendationsApi.listForProject(projectId).then((res) => setRecommendations(res.recommendations));
  }, [projectId, refreshMaterials]);

  // Poll while anything is still in flight, so status/READY chunks appear without a refresh.
  React.useEffect(() => {
    const hasInFlight = materials.some((m) => m.status === "QUEUED" || m.status === "PROCESSING");
    if (!hasInFlight) return;
    const id = setInterval(refreshMaterials, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [materials, refreshMaterials]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setUploadError(null);
    setUploading(true);
    try {
      await projectsApi.uploadMaterial(projectId, file);
      refreshMaterials();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRetry(materialId: string) {
    await projectsApi.retryMaterial(materialId);
    refreshMaterials();
  }

  if (!project) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/spaces/${project.spaceId}`} className="text-sm text-muted-foreground hover:underline">
            &larr; {project.space?.name ?? "Back"}
          </Link>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/projects/${project.id}/analytics`}>
            <Button variant="outline">Analytics</Button>
          </Link>
          <Link to={`/projects/${project.id}/tutor`}>
            <Button variant="outline">Open Tutor</Button>
          </Link>
          <Link to={`/projects/${project.id}/quiz`}>
            <Button>Start Quiz</Button>
          </Link>
        </div>
      </div>

      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recommendations.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">{r.action}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mastery</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {mastery.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No concepts tracked yet — upload a material to get started.
            </p>
          )}
          {mastery.map((c) => (
            <div key={c.conceptId} className="flex items-center justify-between py-2 text-sm">
              <span>{c.conceptName}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{c.latestScore}</span>
                <Badge variant={TREND_VARIANT[c.trend]}>{TREND_LABEL[c.trend]}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={uploading}
              className="text-sm"
            />
            {uploading && <p className="mt-1 text-sm text-muted-foreground">Uploading...</p>}
            {uploadError && <p className="mt-1 text-sm text-destructive">{uploadError}</p>}
          </div>

          <div className="flex flex-col divide-y divide-border">
            {materials.map((material) => (
              <div key={material.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{material.title}</span>
                  {material.status === "FAILED" && material.errorMessage && (
                    <span className="text-xs text-destructive">{material.errorMessage}</span>
                  )}
                  {material.pageCount != null && (
                    <span className="text-xs text-muted-foreground">{material.pageCount} pages</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[material.status]}>{material.status}</Badge>
                  {material.status === "FAILED" && (
                    <Button variant="outline" onClick={() => handleRetry(material.id)}>
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {materials.length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">No materials uploaded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
