import request from "supertest";
import { prisma } from "@asc/shared";
import { createApp } from "../app";

/**
 * Verifies the isolation guarantee Phase 1's brief called for explicitly, and that Phase 2's
 * tutor retrieval will depend on directly: user A can never read, modify, or see the
 * existence of user B's Spaces/Projects/Materials/Chunks, even when A knows B's exact
 * (real, non-guessed) resource ids. Every cross-user access must come back 404, never 403 —
 * a 403 would confirm the resource exists at all.
 *
 * Material/Chunk rows are inserted directly via Prisma rather than through the real
 * upload/AI pipeline, since this test is about query and route scoping, not the processing
 * pipeline (that's covered separately by the manual end-to-end smoke test).
 */
describe("cross-user data isolation", () => {
  const app = createApp();
  const suffix = Date.now();
  const userA = { name: "Isolation A", email: `iso-a-${suffix}@example.com`, password: "password123" };
  const userB = { name: "Isolation B", email: `iso-b-${suffix}@example.com`, password: "password123" };

  const agentA = request.agent(app);
  const agentB = request.agent(app);

  let userAId: string;
  let spaceA: { id: string };
  let spaceB: { id: string };
  let projectA: { id: string };
  let projectB: { id: string };

  beforeAll(async () => {
    const signupA = await agentA.post("/api/auth/signup").send(userA).expect(201);
    await agentB.post("/api/auth/signup").send(userB).expect(201);
    userAId = signupA.body.user.id;

    spaceA = (await agentA.post("/api/spaces").send({ name: "Space A" }).expect(201)).body.space;
    spaceB = (await agentB.post("/api/spaces").send({ name: "Space B" }).expect(201)).body.space;

    projectA = (
      await agentA.post(`/api/spaces/${spaceA.id}/projects`).send({ name: "Project A" }).expect(201)
    ).body.project;
    projectB = (
      await agentB.post(`/api/spaces/${spaceB.id}/projects`).send({ name: "Project B" }).expect(201)
    ).body.project;

    const materialA = await prisma.material.create({
      data: {
        projectId: projectA.id,
        userId: userAId,
        title: "a.pdf",
        fileUrl: "https://example.com/a.pdf",
        fileType: "application/pdf",
        status: "READY",
      },
    });
    const projectBOwner = await prisma.project.findUniqueOrThrow({ where: { id: projectB.id } });
    const materialB = await prisma.material.create({
      data: {
        projectId: projectB.id,
        userId: projectBOwner.userId,
        title: "b.pdf",
        fileUrl: "https://example.com/b.pdf",
        fileType: "application/pdf",
        status: "READY",
      },
    });

    await prisma.chunk.create({
      data: { materialId: materialA.id, projectId: projectA.id, content: "Secret A content", pageNumber: 1 },
    });
    await prisma.chunk.create({
      data: { materialId: materialB.id, projectId: projectB.id, content: "Secret B content", pageNumber: 1 },
    });
  });

  afterAll(async () => {
    // User deletion cascades to Space/Project/Material/Chunk via the schema's onDelete: Cascade.
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await prisma.$disconnect();
  });

  it("returns 404, not 403, when user A reads user B's space directly", async () => {
    const res = await agentA.get(`/api/spaces/${spaceB.id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when user A reads, updates, or deletes user B's project", async () => {
    await agentA.get(`/api/projects/${projectB.id}`).expect(404);
    await agentA.patch(`/api/projects/${projectB.id}`).send({ name: "hijacked" }).expect(404);
    await agentA.delete(`/api/projects/${projectB.id}`).expect(404);
  });

  it("returns 404 when user A lists materials for user B's project", async () => {
    await agentA.get(`/api/projects/${projectB.id}/materials`).expect(404);
  });

  it("never leaks user B's project into user A's own space/project listings", async () => {
    const spaces = await agentA.get("/api/spaces").expect(200);
    expect(spaces.body.spaces.some((s: { id: string }) => s.id === spaceB.id)).toBe(false);

    const projects = await agentA.get(`/api/spaces/${spaceA.id}/projects`).expect(200);
    expect(projects.body.projects.every((p: { id: string }) => p.id !== projectB.id)).toBe(true);
  });

  it("a project-scoped Chunk query never returns another user's chunk content", async () => {
    // This is the exact query shape Phase 2 retrieval will use (WHERE project_id = :projectId),
    // after the route layer has already confirmed the requesting user owns that projectId.
    const chunksForA = await prisma.chunk.findMany({ where: { projectId: projectA.id } });
    const chunksForB = await prisma.chunk.findMany({ where: { projectId: projectB.id } });

    expect(chunksForA.map((c) => c.content)).toEqual(["Secret A content"]);
    expect(chunksForB.map((c) => c.content)).toEqual(["Secret B content"]);
  });

  it("an ownership check keyed on (userId, projectId) rejects a mismatched pair even with B's real id", async () => {
    const mismatched = await prisma.project.findFirst({
      where: { id: projectB.id, userId: userAId },
    });
    expect(mismatched).toBeNull();
  });
});
