import { authorizeRedirect } from "@/auth/authorize";
import { redirect } from "@/auth/cookies";
import { currentListener } from "@/auth/session";
import { getDb } from "@/db/client";

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

  return authorizeRedirect(request, {
    authorizeUrl: SPOTIFY_AUTHORIZE_URL,
    clientId: env.SPOTIFY_CLIENT_ID,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
    scopes: SCOPES,
    cookiePath: PKCE_COOKIE_PATH,
  });
}
