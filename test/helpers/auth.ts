import { env } from "cloudflare:workers";
import { handleGoogleSignIn } from "@/auth/google-redirect";
import { createSession } from "@/auth/session";
import { handleConnectSpotify } from "@/connect/spotify-redirect";
import { getDb } from "@/db/client";
import { invites, listeners } from "@/db/schema";

export const LOCAL_ORIGIN = "http://127.0.0.1:8787";
export const DEPLOYED_ORIGIN = "https://loom.example.workers.dev";

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** RFC 7636 S256 code challenge for a verifier */
export async function s256(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Adds an Invite the way the owner does with wrangler */
export async function invite(email: string) {
  await getDb(env).insert(invites).values({ email });
}

/** Runs the real sign-in redirect, so the callback sees the same cookie and state Google would send back */
export async function startSignIn(origin = LOCAL_ORIGIN) {
  const response = await handleGoogleSignIn(
    new Request(`${origin}/auth/login`),
    env,
  );
  const location = new URL(
    response.headers.get("Location") ?? "http://missing.invalid",
  );
  const state = location.searchParams.get("state") ?? "";
  const pkce = responseCookies(response).get("loom_pkce")?.value ?? "";
  const verifier = pkce.split(".")[1] ?? "";
  return { state, pkceCookie: `loom_pkce=${pkce}`, verifier };
}

export function signInCallbackRequest(
  params: Record<string, string>,
  cookies: string[] = [],
  origin = LOCAL_ORIGIN,
) {
  const url = new URL(`${origin}/auth/callback`);
  url.search = new URLSearchParams(params).toString();
  const headers: Record<string, string> = cookies.length
    ? { Cookie: cookies.join("; ") }
    : {};
  return new Request(url, { headers });
}

/** Every Set-Cookie on a response, keyed by cookie name */
export function responseCookies(response: Response) {
  const cookies = new Map<string, { value: string; attributes: string[] }>();
  for (const header of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = header
      .split(";")
      .map(part => part.trim());
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), {
      value: pair.slice(separator + 1),
      attributes,
    });
  }
  return cookies;
}

export async function insertListener(id = "listener-1", now = new Date()) {
  await getDb(env)
    .insert(listeners)
    .values({
      id,
      googleSub: `google-sub-${id}`,
      email: `${id}@example.com`,
      createdAt: now,
    });
  return id;
}

/** A Listener with a live session, and the Cookie header that carries it */
export async function signedInListener(id = "listener-1", now = new Date()) {
  await insertListener(id, now);
  const session = await createSession(getDb(env), id, now);
  return { id, sessionCookie: `loom_session=${session}` };
}

/** Runs the real Connect Spotify redirect, so the callback sees the same cookie and state Spotify would send back */
export async function startSpotifyConnect(
  sessionCookie: string,
  origin = LOCAL_ORIGIN,
) {
  const response = await handleConnectSpotify(
    new Request(`${origin}/connect/spotify`, {
      headers: { Cookie: sessionCookie },
    }),
    env,
  );
  const location = new URL(
    response.headers.get("Location") ?? "http://missing.invalid",
  );
  const state = location.searchParams.get("state") ?? "";
  const pkce = responseCookies(response).get("loom_pkce")?.value ?? "";
  const verifier = pkce.split(".")[1] ?? "";
  return { state, pkceCookie: `loom_pkce=${pkce}`, verifier };
}

export function spotifyCallbackRequest(
  params: Record<string, string>,
  cookies: string[] = [],
  origin = LOCAL_ORIGIN,
) {
  const url = new URL(`${origin}/connect/spotify/callback`);
  url.search = new URLSearchParams(params).toString();
  const headers: Record<string, string> = cookies.length
    ? { Cookie: cookies.join("; ") }
    : {};
  return new Request(url, { headers });
}
