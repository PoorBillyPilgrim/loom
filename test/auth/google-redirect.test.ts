import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { handleLogin } from "@/auth/login";
import { DEPLOYED_ORIGIN, LOCAL_ORIGIN, s256 } from "../helpers/auth";

async function signIn(origin = LOCAL_ORIGIN) {
  const response = await handleLogin(new Request(`${origin}/auth/login`), env);
  const location = new URL(
    response.headers.get("Location") ?? "http://missing.invalid",
  );
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  const [pair = "", ...attributes] = setCookie
    .split(";")
    .map(part => part.trim());
  const [cookieName, cookieValue = ""] = pair.split("=");
  const [cookieState, cookieVerifier] = cookieValue.split(".");
  return {
    response,
    location,
    setCookie,
    cookieName,
    cookieState,
    cookieVerifier,
    attributes,
  };
}

describe("Sign in with Google", () => {
  it("redirects to Google authorize with PKCE and the OpenID scopes", async () => {
    const { response, location } = await signIn();

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.pathname).toBe("/o/oauth2/v2/auth");
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: "test-google-client-id",
      response_type: "code",
      redirect_uri: "http://127.0.0.1:8787/auth/callback",
      scope: "openid email profile",
      code_challenge_method: "S256",
    });
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(location.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("stores verifier and state in a short-lived HttpOnly cookie on the sign-in path", async () => {
    const { location, cookieName, cookieState, cookieVerifier, attributes } =
      await signIn();

    expect(cookieName).toBe("loom_pkce");
    expect(attributes).toEqual(
      expect.arrayContaining([
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=600",
        "Path=/auth",
      ]),
    );
    expect(cookieState).toBe(location.searchParams.get("state"));
    // RFC 7636: verifier is 43-128 unreserved characters
    expect(cookieVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(await s256(cookieVerifier!)).toBe(
      location.searchParams.get("code_challenge"),
    );
  });

  it("generates a new state and verifier per request", async () => {
    const first = await signIn();
    const second = await signIn();

    expect(second.cookieState).not.toBe(first.cookieState);
    expect(second.cookieVerifier).not.toBe(first.cookieVerifier);
  });

  it("marks the cookie Secure only over https", async () => {
    const local = await signIn(LOCAL_ORIGIN);
    const deployed = await signIn(DEPLOYED_ORIGIN);

    expect(local.setCookie).not.toBe("");
    expect(local.attributes).not.toContain("Secure");
    expect(deployed.attributes).toContain("Secure");
  });
});
