import { sign, verify } from "hono/jwt";
import { env } from "../env";

export interface JwtPayload {
  sub: string; // user id
  githubUsername: string;
  githubId: number;
  email: string;
  iat?: number;
  exp?: number;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await sign(
    { ...payload, iat: now, exp: now + SESSION_TTL_SECONDS },
    env.JWT_SECRET,
  );
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  // `verify` returns a `JWTPayload` (typed as `unknown`); cast via `unknown`
  // to our richer payload shape. Pass the algorithm explicitly so future Hono
  // versions that require it don't break this call.
  return (await verify(token, env.JWT_SECRET, "HS256")) as unknown as JwtPayload;
}