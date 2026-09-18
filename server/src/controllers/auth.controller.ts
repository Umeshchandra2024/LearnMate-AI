import type { Request, Response } from "express";
import { z } from "zod";
import { getEnv, prisma } from "@asc/shared";
import { hashPassword, comparePassword } from "../utils/password";
import { signAuthToken } from "../utils/jwt";
import { HttpError } from "../middleware/errorHandler";

const signupSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setAuthCookie(res: Response, token: string) {
  const env = getEnv();
  // SameSite=Lax blocks the cookie on cross-site requests (e.g. the Vercel frontend calling
  // the Render API), so production needs "none" — which browsers only honor alongside
  // Secure, hence both being tied to the same NODE_ENV check. Local dev (same-origin via
  // Vite's proxy, plain HTTP) keeps "lax"/non-secure, which is what actually works over
  // localhost HTTP.
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function toPublicUser(user: { id: string; email: string; name: string; isAdmin: boolean }) {
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
}

export async function signup(req: Request, res: Response) {
  const { name, email, password } = signupSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with that email already exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = signAuthToken({ sub: user.id, email: user.email, isAdmin: user.isAdmin });
  setAuthCookie(res, token);
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signAuthToken({ sub: user.id, email: user.email, isAdmin: user.isAdmin });
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
}

export async function logout(_req: Request, res: Response) {
  const env = getEnv();
  res.clearCookie(env.COOKIE_NAME);
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }
  res.json({ user: toPublicUser(user) });
}
