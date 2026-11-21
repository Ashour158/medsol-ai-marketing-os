import { createHash, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import {marketingTenantResolutionMode,resolveMarketingOrganizationId} from "@medsol/contracts";

export const SESSION_COOKIE = "__Host-medsol_session";
export const FLOW_COOKIE = "__Host-medsol_oidc_flow";
export type Session = { accessToken: string; organizationId: string; expiresAt: number; sessionId: string };

function secrets() {
  const configured = process.env.MARKETING_SESSION_SECRETS?.split(",").map(s => s.trim()).filter(Boolean) ??
    (process.env.MARKETING_SESSION_SECRET ? [process.env.MARKETING_SESSION_SECRET] : []);
  if (!configured.length || configured.length > 3) throw new Error("Configure one to three session keys");
  return configured.map(value => {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length !== 32 || bytes.toString("base64url") !== value) throw new Error("MARKETING_SESSION_SECRET must be at least 32 random bytes encoded as base64url");
    return new Uint8Array(bytes);
  });
}
export function randomToken() { return randomBytes(32).toString("base64url"); }
export function challenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }
export function entraTenant() {
  const tenant = process.env.MARKETING_ENTRA_TENANT_ID;
  if (!tenant || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) throw new Error("Microsoft Entra tenant GUID required");
  return tenant.toLowerCase();
}
export function entraScope() {
  const scope = process.env.MARKETING_ENTRA_API_SCOPE;
  if (!scope || !/^api:\/\/[a-zA-Z0-9._/-]+\/[a-zA-Z0-9._-]+$/.test(scope)) throw new Error("Microsoft Entra delegated API scope required");
  return scope;
}
export function authConfig() {
  const issuer = process.env.MARKETING_OIDC_ISSUER;
  const clientId = process.env.MARKETING_OIDC_CLIENT_ID;
  const origin = process.env.MARKETING_PUBLIC_ORIGIN;
  const organizationId = process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
  if (!issuer || !clientId || !origin) throw new Error("OIDC client configuration incomplete");
  const tenantMode=marketingTenantResolutionMode(process.env.MARKETING_TENANT_RESOLUTION_MODE);
  // Validate configuration before initiating a redirect; never fall back to
  // request-supplied tenant or a permissive onboarding organization.
  if(tenantMode==="FIXED")resolveMarketingOrganizationId({},organizationId,tenantMode);
  else if(organizationId)throw new Error("Signed-claim mode requires fixed organization unset");
  if (issuer !== 'https://login.microsoftonline.com/' + entraTenant() + '/v2.0') throw new Error('Tenant-specific Microsoft Entra issuer required');
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("HTTPS origin required");
  return { issuer, clientId, origin: url.origin,
   organizationId:tenantMode==="FIXED"?organizationId:null,tenantMode };
}
export async function seal(payload: Record<string, unknown>, ttlSeconds: number) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds).encrypt(secrets()[0]!);
}
export async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  for (const key of secrets()) {
    try { const { payload } = await jwtDecrypt(token, key, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] }); return payload as T; }
    catch { /* Try the next configured rotation key. */ }
  }
  return null;
}
export function secureCookie(maxAge: number) { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge }; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = authConfig().origin;
  return !!origin && origin === expected;
}
