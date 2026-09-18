import * as React from "react";
import { Link } from "react-router-dom";
import { spacesApi } from "@/api/spaces";
import type { Space } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SpacesPage() {
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const refresh = React.useCallback(() => {
    spacesApi.list().then((res) => setSpaces(res.spaces));
  }, []);

  React.useEffect(refresh, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await spacesApi.create({ name });
      setName("");
      refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Your Spaces</h1>
        <p className="text-sm text-muted-foreground">
          A Space groups related Projects, e.g. a course or a subject.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="New space name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={creating}>
          Create
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {spaces?.map((space) => (
          <Link key={space.id} to={`/spaces/${space.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{space.name}</CardTitle>
                <CardDescription>{space._count?.projects ?? 0} projects</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {spaces && spaces.length === 0 && (
          <p className="text-sm text-muted-foreground">No spaces yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
