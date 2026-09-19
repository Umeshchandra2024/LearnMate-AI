import request from "supertest";
import { prisma } from "@asc/shared";
import { createApp } from "../app";

/**
 * Logout has to actually end the session. A cookie can only be cleared by a Set-Cookie whose
 * Path/Secure/SameSite match how it was set — a mismatch makes clearCookie a silent no-op
 * and the user stays logged in — so these tests check the real round trip plus the exact
 * attributes, including the production (cross-site) combination.
 */
describe("logout", () => {
  const app = createApp();
  const user = {
    name: "Logout Tester",
    email: `logout-${Date.now()}@example.com`,
    password: "password123",
  };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: user.email } });
    await prisma.$disconnect();
  });

  function findAuthCookie(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const cookie = cookies.find((c) => c.startsWith("asc_token="));
    if (!cookie) throw new Error(`no auth Set-Cookie in response: ${JSON.stringify(cookies)}`);
    return cookie;
  }

  it("ends the session: an authenticated route is 401 after logout", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send(user).expect(201);
    await agent.get("/api/auth/me").expect(200);

    await agent.post("/api/auth/logout").expect(204);

    await agent.get("/api/auth/me").expect(401);
  });

  it("clears the cookie with the same Path/HttpOnly/SameSite/Secure it was set with", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);
    const logout = await request(app).post("/api/auth/logout").expect(204);

    const set = findAuthCookie(login);
    const cleared = findAuthCookie(logout);

    for (const attr of ["Path=/", "HttpOnly", "SameSite=Lax"]) {
      expect(set).toContain(attr);
      expect(cleared).toContain(attr);
    }
    expect(set.includes("Secure")).toBe(cleared.includes("Secure"));

    const expires = /Expires=([^;]+)/i.exec(cleared)?.[1];
    expect(expires).toBeDefined();
    expect(new Date(expires!).getTime()).toBeLessThan(Date.now());
  });

  it("in production, clears with Secure + SameSite=None (the cross-site attributes) and no maxAge", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { logout } = require("../controllers/auth.controller");
        const clearCookie = jest.fn();
        const res = { clearCookie, status: jest.fn().mockReturnThis(), send: jest.fn() };

        logout({}, res);

        expect(clearCookie).toHaveBeenCalledWith("asc_token", {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          path: "/",
        });
      });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
