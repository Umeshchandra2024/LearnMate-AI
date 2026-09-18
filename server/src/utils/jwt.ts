import jwt from "jsonwebtoken";
import { getEnv } from "@asc/shared";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const env = getEnv();
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
