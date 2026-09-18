import type { NextFunction, Request, Response } from "express";
import { getEnv } from "@asc/shared";
import { verifyAuthToken } from "../utils/jwt";

/** Attaches req.user from the auth cookie, or responds 401 if missing/invalid. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const env = getEnv();
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, email: payload.email, isAdmin: payload.isAdmin };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

/**
 * Layers on top of requireAuth. Admin status is re-checked server-side on every request
 * from the JWT payload — never trust a client-side "isAdmin" flag or hidden nav item alone.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
