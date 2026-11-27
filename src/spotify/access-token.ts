import { and, eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/auth/crypto";
import { LoomError } from "@/core/errors";
import type { Db } from "@/db/client";
import { connections } from "@/db/schema";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
// Refresh a minute early so a token can't expire mid-request
const EXPIRY_MARGIN_MS = 60 * 1000;

/** Spotify's 6-month authorization ran out; the Listener must reconnect */
export class SpotifyNeedsReconnect extends LoomError {
  constructor() {
    super("spotify_needs_reconnect");
  }
}

export class SpotifyNotConnected extends LoomError {
  constructor() {
    super("spotify_not_connected");
  }
}

type RefreshedTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export async function spotifyAccessToken(
  db: Db,
  env: Env,
  listenerId: string,
  now: Date,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<string> {
  const key = env.TOKEN_ENCRYPTION_KEY;
  const spotifyConnection = and(
    eq(connections.listenerId, listenerId),
    eq(connections.kind, "spotify"),
  );
  const [connection] = await db
    .select()
    .from(connections)
    .where(spotifyConnection);
  if (!connection) throw new SpotifyNotConnected();
  const { accessTokenEnc, refreshTokenEnc, accessTokenExpiresAt } = connection;
  if (!refreshTokenEnc) throw new SpotifyNeedsReconnect();

  if (
    !forceRefresh &&
    accessTokenEnc &&
    accessTokenExpiresAt &&
    accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime()
  ) {
    return decryptToken(accessTokenEnc, key);
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: await decryptToken(refreshTokenEnc, key),
    }),
  }).catch(() => {
    throw new LoomError("spotify_unavailable");
  });

  // Only invalid_grant means the authorization is gone. Other 400s are Loom's own config.
  if (response.status === 400) {
    const { error } = await response
      .json<{ error?: string }>()
      .catch(() => ({ error: undefined }));
    if (error === "invalid_grant") {
      await db
        .update(connections)
        .set({
          accessTokenEnc: null,
          refreshTokenEnc: null,
          accessTokenExpiresAt: null,
        })
        .where(spotifyConnection);
      throw new SpotifyNeedsReconnect();
    }
  }
  if (response.status === 429) throw new LoomError("spotify_rate_limited");
  if (response.status >= 500) throw new LoomError("spotify_unavailable");
  if (!response.ok) {
    throw new Error(`Spotify token refresh failed with ${response.status}`);
  }

  const tokens = await response.json<RefreshedTokens>();
  await db
    .update(connections)
    .set({
      accessTokenEnc: await encryptToken(tokens.access_token, key),
      accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
      // Spotify sometimes sends a new refresh token. Keep the original issue date.
      ...(tokens.refresh_token
        ? { refreshTokenEnc: await encryptToken(tokens.refresh_token, key) }
        : {}),
    })
    .where(spotifyConnection);
  return tokens.access_token;
}
