import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { authConfig, challenge, randomToken, seal, unseal, sameOrigin } from "./marketing-auth";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
describe("marketing session cryptography and OIDC request protection", () => {
  it("encrypts session payload and rejects tampering", async () => {
    process.env.MARKETING_SESSION_SECRET = randomBytes(32).toString("base64url");
    const token = await seal({ organizationId: "tenant", accessToken: "private", expiresAt: Date.now() + 30000 }, 60);
    expect(token).not.toContain("private");
    expect(await unseal<{ organizationId: string }>(token)).toMatchObject({ organizationId: "tenant" });
    expect(await unseal(token.slice(0, -4) + "xxxx")).toBeNull();
  });
  it("requires high entropy encryption key", async () => {
    process.env.MARKETING_SESSION_SECRET = "short";
    await expect(seal({ x: 1 }, 60)).rejects.toThrow("32 random bytes");
  });
  it("generates distinct PKCE verifiers and SHA256 challenges", () => {
    const a = randomToken(), b = randomToken();
    expect(a).not.toBe(b);
    expect(challenge(a)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("rejects cross-origin POSTs", () => {
    process.env.MARKETING_PUBLIC_ORIGIN = "https://marketing.medsol.example";
    process.env.MARKETING_OIDC_ISSUER = "https://identity.example";
    process.env.MARKETING_OIDC_CLIENT_ID = "medsol-web";
    process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID = "tenant";
    expect(sameOrigin(new Request("https://marketing.medsol.example/api", { method: "POST", headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(sameOrigin(new Request("https://marketing.medsol.example/api", { method: "POST", headers: { origin: "https://marketing.medsol.example" } }))).toBe(true);
    expect(authConfig().organizationId).toBe("tenant");
  });
});
