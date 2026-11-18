import { createHash, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

export const SESSION_COOKIE = "__Host-medsol_session";
export const FLOW_COOKIE = "__Host-medsol_oidc_flow";
export type Session = { accessToken: string; organizationId: string; expiresAt: number };

function secret() {
  const value = process.env.MARKETING_SESSION_SECRET;
  if (!value || Buffer.from(value, "base64url").length < 32) throw new Error("MARKETING_SESSION_SECRET must be at least 32 random bytes encoded as base64url");
  return new Uint8Array(Buffer.from(value, "base64url"));
}
export function randomToken() { return randomBytes(32).toString("base64url"); }
export function challenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }
export function authConfig() {
  const issuer = process.env.MARKETING_OIDC_ISSUER;
  const clientId = process.env.MARKETING_OIDC_CLIENT_ID;
  const origin = process.env.MARKETING_PUBLIC_ORIGIN;
  const organizationId = process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
  if (!issuer || !clientId || !origin || !organizationId) throw new Error("OIDC client configuration incomplete");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("HTTPS origin required");
  return { issuer, clientId, origin: url.origin, organizationId };
}
export async function seal(payload: Record<string, unknown>, ttlSeconds: number) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds).encrypt(secret());
}
export async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try { const { payload } = await jwtDecrypt(token, secret(), { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] }); return payload as T; }
  catch { return null; }
}
export function secureCookie(maxAge: number) { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge }; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = authConfig().origin;
  return !!origin && origin === expected;
}
