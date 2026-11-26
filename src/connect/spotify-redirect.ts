import { redirect, serializeCookie } from "@/auth/cookies";
import { createPkce, randomToken } from "@/auth/pkce";
import { currentListener } from "@/auth/session";
import { getDb } from "@/db/client";

export const PKCE_COOKIE = "loom_pkce";
export const PKCE_COOKIE_PATH = "/connect/spotify";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SCOPES = [
  "user-top-read",
  "user-follow-read",
  "user-follow-modify",
  "user-library-read",
  "user-library-modify",
];

export async function handleConnectSpotify(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  if (!(await currentListener(request, getDb(env), now)))
    return redirect("/auth/login");

  const state = randomToken(32);
  const { verifier, challenge } = await createPkce();

  const authorize = new URL(SPOTIFY_AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();

  return redirect(authorize.toString(), [
    serializeCookie(request, PKCE_COOKIE, `${state}.${verifier}`, {
      path: PKCE_COOKIE_PATH,
      maxAge: 600,
    }),
  ]);
}
