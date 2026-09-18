import request from "supertest";
import { prisma } from "@asc/shared";
import { createApp } from "../app";

/**
 * requireAdmin must actually reject a non-admin request server-side — the client hiding the
 * "Admin" nav link (RequireAdmin.tsx) is a UX nicety, never the real boundary. This is what
 * Phase 5's manual browser verification checked by hand; this test makes it automatic.
 */
describe("admin route access control", () => {
  const app = createApp();
  const suffix = Date.now();
  const regularUser = { name: "Not Admin", email: `not-admin-${suffix}@example.com`, password: "password123" };
  const adminUser = { name: "Is Admin", email: `is-admin-${suffix}@example.com`, password: "password123" };

  const regularAgent = request.agent(app);
  const adminAgent = request.agent(app);

  beforeAll(async () => {
    await regularAgent.post("/api/auth/signup").send(regularUser).expect(201);
    await adminAgent.post("/api/auth/signup").send(adminUser).expect(201);
    await prisma.user.update({ where: { email: adminUser.email }, data: { isAdmin: true } });
    // The JWT already issued at signup encodes isAdmin: false for the admin account, since
    // isAdmin was flipped afterward — re-login so the cookie reflects the updated claim, the
    // same way a real admin promotion would require a fresh session.
    await adminAgent.post("/api/auth/login").send({ email: adminUser.email, password: adminUser.password }).expect(200);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [regularUser.email, adminUser.email] } } });
    await prisma.$disconnect();
  });

  it("rejects a non-admin user with 403, not a silent empty result", async () => {
    const res = await regularAgent.get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });

  it("rejects a non-admin user from every admin sub-route, including Bull Board", async () => {
    await regularAgent.get("/api/admin/activity").expect(403);
    await regularAgent.get("/api/admin/ai-usage").expect(403);
    await regularAgent.get("/api/admin/evals").expect(403);
    await regularAgent.get("/api/admin/queues").expect(403);
  });

  it("rejects an unauthenticated request with 401 before requireAdmin even runs", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("allows a genuinely admin user through", async () => {
    const res = await adminAgent.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});
