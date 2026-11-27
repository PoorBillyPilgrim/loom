import { and, eq } from "drizzle-orm";
import { clearPkceCookie, readAuthorizationCode } from "@/auth/authorize";
import { redirect } from "@/auth/cookies";
import { encryptToken } from "@/auth/crypto";
import { currentListener } from "@/auth/session";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { PKCE_COOKIE_PATH } from "./spotify-redirect";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";

type ConnectOutcome = "expired" | "limited" | "denied" | "taken" | "failed";
type SpotifyTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function handleSpotifyCallback(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  const clearPkce = clearPkceCookie(request, PKCE_COOKIE_PATH);
  const fail = (outcome: ConnectOutcome) =>
    redirect(`/explore?spotify=${outcome}`, [clearPkce]);

  const db = getDb(env);
  const listener = await currentListener(request, db, now);
  if (!listener) return redirect("/auth/login", [clearPkce]);

  if (new URL(request.url).searchParams.get("error")) return fail("denied");

  const authorization = readAuthorizationCode(request);
  if (!authorization) return fail("expired");
  const { code, verifier } = authorization;

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  // Spotify answers 400 when the code was already used or has expired
  if (tokenResponse.status === 400) return fail("expired");
  if (!tokenResponse.ok) return fail("failed");
  const tokens = await tokenResponse.json<SpotifyTokens>();

  const meResponse = await fetch(SPOTIFY_ME_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  // Development Mode apps answer 403 for anyone not on the dashboard allowlist
  if (meResponse.status === 403) return fail("limited");
  if (!meResponse.ok) return fail("failed");
  // Spotify recommends account_id over id for account linking
  const { account_id: externalAccountId } = await meResponse.json<{
    account_id: string;
  }>();

  // One Spotify account can belong to only one Listener
  const [owner] = await db
    .select({ listenerId: connections.listenerId })
    .from(connections)
    .where(
      and(
        eq(connections.kind, "spotify"),
        eq(connections.externalAccountId, externalAccountId),
      ),
    );
  if (owner && owner.listenerId !== listener.id) return fail("taken");

  const connectionColumns = {
    externalAccountId,
    accessTokenEnc: await encryptToken(
      tokens.access_token,
      env.TOKEN_ENCRYPTION_KEY,
    ),
    refreshTokenEnc: await encryptToken(
      tokens.refresh_token,
      env.TOKEN_ENCRYPTION_KEY,
    ),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    // Each authorization restarts Spotify's 6-month refresh token clock
    refreshTokenIssuedAt: now,
  };
  await db
    .insert(connections)
    .values({
      id: crypto.randomUUID(),
      listenerId: listener.id,
      kind: "spotify",
      linkedAt: now,
      ...connectionColumns,
    })
    .onConflictDoUpdate({
      target: [connections.listenerId, connections.kind],
      set: connectionColumns,
    });

  return redirect("/explore", [clearPkce]);
}
