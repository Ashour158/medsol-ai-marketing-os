import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { authConfig, oidcClientSecret, challenge, randomToken, seal, unseal, sameOrigin } from "./marketing-auth";

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
  it("decrypts existing sessions during a safe key rotation", async () => {
    const oldKey = randomBytes(32).toString("base64url"), nextKey = randomBytes(32).toString("base64url");
    delete process.env.MARKETING_SESSION_SECRETS;
    process.env.MARKETING_SESSION_SECRET = oldKey;
    const previous = await seal({ user: "verified" }, 60);
    process.env.MARKETING_SESSION_SECRETS = nextKey + "," + oldKey;
    expect(await unseal(previous)).toMatchObject({ user: "verified" });
    const rotated = await seal({ user: "new" }, 60);
    process.env.MARKETING_SESSION_SECRETS = nextKey;
    expect(await unseal(previous)).toBeNull();
    expect(await unseal(rotated)).toMatchObject({ user: "new" });
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
  it("validates single-tenant default and signed-claim opt-in configuration",()=>{
    process.env.MARKETING_PUBLIC_ORIGIN="https://marketing.medsol.example";
    process.env.MARKETING_ENTRA_TENANT_ID="11111111-1111-4111-8111-111111111111";
    process.env.MARKETING_OIDC_ISSUER="https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0";
    process.env.MARKETING_OIDC_CLIENT_ID="medsol-web";
    process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID="tenant-a";
    expect(authConfig().organizationId).toBe("tenant-a");
    process.env.MARKETING_TENANT_RESOLUTION_MODE="SIGNED_OIDC_CLAIM";
    expect(()=>authConfig()).toThrow("fixed organization unset");
    delete process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
    expect(authConfig()).toMatchObject({organizationId:null,tenantMode:"SIGNED_OIDC_CLAIM"});
  });
  it("rejects synthetic login secret outside the exact disposable CI trust fence",()=>{
    process.env.MARKETING_ENTRA_CLIENT_SECRET="entra-confidential-secret";
    process.env.MARKETING_OFFLINE_OIDC_CLIENT_SECRET="ci-disposable-not-real";
    process.env.MARKETING_DISPOSABLE_OIDC_CI_ONLY="1";
    expect(oidcClientSecret("https://127.0.0.1:3215"))
     .toBe("entra-confidential-secret");
    expect(oidcClientSecret("https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0"))
     .toBe("entra-confidential-secret");
  });
  it("rejects cross-origin POSTs", () => {
    process.env.MARKETING_PUBLIC_ORIGIN = "https://marketing.medsol.example";
    process.env.MARKETING_ENTRA_TENANT_ID = "11111111-1111-4111-8111-111111111111";
    process.env.MARKETING_OIDC_ISSUER = "https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0";
    process.env.MARKETING_OIDC_CLIENT_ID = "medsol-web";
    process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID = "tenant";
    expect(sameOrigin(new Request("https://marketing.medsol.example/api", { method: "POST", headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(sameOrigin(new Request("https://marketing.medsol.example/api", { method: "POST", headers: { origin: "https://marketing.medsol.example" } }))).toBe(true);
    expect(authConfig().organizationId).toBe("tenant");
  });
});
