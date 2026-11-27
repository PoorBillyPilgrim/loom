import { describe, expect, it } from "vitest";
import {
  authorizeRedirect,
  clearPkceCookie,
  readAuthorizationCode,
  type AuthorizationServer,
} from "@/auth/authorize";
import {
  DEPLOYED_ORIGIN,
  LOCAL_ORIGIN,
  responseCookies,
  s256,
} from "../helpers/auth";

const SERVER: AuthorizationServer = {
  authorizeUrl: "https://auth.example.com/oauth/authorize",
  clientId: "example-client-id",
  redirectUri: "http://127.0.0.1:8787/example/callback",
  scopes: ["read", "write"],
  cookiePath: "/example",
};

async function startAuthorization(origin = LOCAL_ORIGIN) {
  const response = await authorizeRedirect(
    new Request(`${origin}/example`),
    SERVER,
  );
  const location = new URL(
    response.headers.get("Location") ?? "http://missing.invalid",
  );
  const pkce = responseCookies(response).get("loom_pkce");
  const [cookieState = "", cookieVerifier = ""] = (pkce?.value ?? "").split(
    ".",
  );
  return { response, location, pkce, cookieState, cookieVerifier };
}

function callbackRequest(params: Record<string, string>, cookie?: string) {
  const url = new URL(`${LOCAL_ORIGIN}/example/callback`);
  url.search = new URLSearchParams(params).toString();
  return new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
}

describe("authorizeRedirect", () => {
  it("redirects to the server's authorize URL with PKCE and its scopes", async () => {
    const { response, location } = await startAuthorization();

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://auth.example.com");
    expect(location.pathname).toBe("/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: "example-client-id",
      response_type: "code",
      redirect_uri: "http://127.0.0.1:8787/example/callback",
      scope: "read write",
      code_challenge_method: "S256",
    });
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("keeps state and verifier in a short-lived HttpOnly cookie on the server's path", async () => {
    const { location, pkce, cookieState, cookieVerifier } =
      await startAuthorization();

    expect(pkce?.attributes).toEqual(
      expect.arrayContaining([
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=600",
        "Path=/example",
      ]),
    );
    expect(cookieState).toBe(location.searchParams.get("state"));
    // RFC 7636: verifier is 43-128 unreserved characters
    expect(cookieVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(await s256(cookieVerifier)).toBe(
      location.searchParams.get("code_challenge"),
    );
  });

  it("generates a new state and verifier per request", async () => {
    const first = await startAuthorization();
    const second = await startAuthorization();

    expect(first.cookieState).not.toBe("");
    expect(second.cookieState).not.toBe(first.cookieState);
    expect(second.cookieVerifier).not.toBe(first.cookieVerifier);
  });

  it("marks the cookie Secure only over https", async () => {
    const local = await startAuthorization(LOCAL_ORIGIN);
    const deployed = await startAuthorization(DEPLOYED_ORIGIN);

    expect(local.pkce).toBeDefined();
    expect(local.pkce?.attributes ?? []).not.toContain("Secure");
    expect(deployed.pkce?.attributes ?? []).toContain("Secure");
  });
});

describe("readAuthorizationCode", () => {
  it("returns the code and the verifier when the state matches the cookie", () => {
    const result = readAuthorizationCode(
      callbackRequest({ code: "auth-code", state: "s" }, "loom_pkce=s.v"),
    );

    expect(result).toEqual({ code: "auth-code", verifier: "v" });
  });

  it("returns the code and the verifier from the redirect's cookie when the state matches", async () => {
    const { location, pkce, cookieVerifier } = await startAuthorization();

    const result = readAuthorizationCode(
      callbackRequest(
        { code: "auth-code", state: location.searchParams.get("state") ?? "" },
        `other=1; loom_pkce=${pkce?.value}`,
      ),
    );

    expect(result).toEqual({ code: "auth-code", verifier: cookieVerifier });
  });

  it.each([
    [
      "the state doesn't match",
      { code: "c", state: "forged" },
      "loom_pkce=s.v",
    ],
    ["the cookie is missing", { code: "c", state: "s" }, undefined],
    ["the cookie has no verifier", { code: "c", state: "s" }, "loom_pkce=s"],
    ["the code is missing", { state: "s" }, "loom_pkce=s.v"],
  ])("returns nothing when %s", (_, params, cookie) => {
    expect(readAuthorizationCode(callbackRequest(params, cookie))).toBe(
      undefined,
    );
  });

  it("returns nothing when neither the state nor the cookie is present", () => {
    expect(readAuthorizationCode(callbackRequest({ code: "c" }))).toBe(
      undefined,
    );
  });
});

describe("clearPkceCookie", () => {
  it("expires the PKCE cookie on the given path", () => {
    const header = clearPkceCookie(
      new Request(`${LOCAL_ORIGIN}/example/callback`),
      "/example",
    );

    expect(header.split("; ")).toEqual([
      "loom_pkce=",
      "Path=/example",
      "Max-Age=0",
      "SameSite=Lax",
      "HttpOnly",
    ]);
  });

  it("marks it Secure over https", () => {
    const header = clearPkceCookie(
      new Request(`${DEPLOYED_ORIGIN}/example/callback`),
      "/example",
    );

    expect(header.split("; ")).toContain("Secure");
  });
});
