import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { spacesApi } from "@/api/spaces";
import type { Project, Space } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [space, setSpace] = React.useState<(Space & { projects: Project[] }) | null>(null);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const refresh = React.useCallback(() => {
    if (!spaceId) return;
    spacesApi.get(spaceId).then((res) => setSpace(res.space));
  }, [spaceId]);

  React.useEffect(refresh, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!spaceId || !name.trim()) return;
    setCreating(true);
    try {
      await spacesApi.createProject(spaceId, { name });
      setName("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  if (!space) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/spaces" className="text-sm text-muted-foreground hover:underline">
          &larr; All spaces
        </Link>
        <h1 className="text-2xl font-semibold">{space.name}</h1>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="New project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={creating}>
          Create project
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {space.projects.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{project.description ?? "No description"}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {space.projects.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
