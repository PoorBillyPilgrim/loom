import { LoomError } from "@/core/errors";
import type { Db } from "@/db/client";
import { spotifyAccessToken } from "@/spotify/access-token";

export const SPOTIFY_API_URL = "https://api.spotify.com/v1";
// Longer waits would hold up the page the Listener is looking at
const MAX_RETRY_AFTER_SECONDS = 3;

export type SpotifyContext = {
  db: Db;
  env: Env;
  listenerId: string;
  now: Date;
  sleep?: (ms: number) => Promise<void>;
};

export async function spotifyGet<T>(
  ctx: SpotifyContext,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${SPOTIFY_API_URL}${path}`);
  url.search = new URLSearchParams(params).toString();
  const accessToken = (forceRefresh = false) =>
    spotifyAccessToken(ctx.db, ctx.env, ctx.listenerId, ctx.now, {
      forceRefresh,
    });

  let token = await accessToken();
  let response = await send(url, token);
  if (response.status === 401) {
    token = await accessToken(true);
    response = await send(url, token);
  }

  if (response.status === 429) {
    const wait = retryAfterSeconds(response);
    if (
      (await isQuotaExceeded(response)) ||
      wait === undefined ||
      wait > MAX_RETRY_AFTER_SECONDS
    ) {
      throw await rateLimitError(response);
    }
    await (ctx.sleep ?? sleep)(wait * 1000);
    response = await send(url, token);
    if (response.status === 429) throw await rateLimitError(response);
  }

  if (response.status >= 500) throw new LoomError("spotify_unavailable");
  if (!response.ok) {
    throw new Error(`Spotify answered ${response.status} to GET ${path}`);
  }
  return response.json<T>();
}

async function send(url: URL, token: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new LoomError("spotify_unavailable");
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After")?.trim() ?? "";
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

// Spotify's dev-mode quota is shared and unpublished, so waiting won't help
async function isQuotaExceeded(response: Response): Promise<boolean> {
  const body = await response
    .clone()
    .json<{ error?: { reason?: string } }>()
    .catch(() => ({ error: undefined }));
  return body.error?.reason === "QUOTA_EXCEEDED";
}

async function rateLimitError(response: Response): Promise<LoomError> {
  return new LoomError(
    (await isQuotaExceeded(response))
      ? "spotify_quota_exceeded"
      : "spotify_rate_limited",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
