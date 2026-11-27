import { currentListener } from "@/auth/session";
import { LoomError } from "@/core/errors";
import { getDb } from "@/db/client";
import { spotifyAccessToken } from "@/spotify/access-token";
import { SPOTIFY_API_URL } from "@/spotify/client";

/** Local only: shows Spotify's raw response, for re-recording test fixtures */
export async function handleSpotifyProxy(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  // Calls Spotify as the signed-in Listener, so it must never be reachable once deployed
  if (
    env.LOOM_RECORD_FIXTURES !== "true" ||
    url.hostname !== "127.0.0.1" ||
    request.method !== "GET"
  ) {
    return notFound();
  }

  const db = getDb(env);
  const listener = await currentListener(request, db, now);
  if (!listener) return notFound();

  let token: string;
  try {
    token = await spotifyAccessToken(db, env, listener.id, now);
  } catch (error) {
    if (!(error instanceof LoomError)) throw error;
    return Response.json({ error: error.code }, { status: 502 });
  }

  const path = url.pathname.replace(/^\/dev\/spotify/, "");
  const spotify = await fetch(`${SPOTIFY_API_URL}${path}${url.search}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return new Response(spotify.body, {
    status: spotify.status,
    headers: {
      "Content-Type": spotify.headers.get("Content-Type") ?? "application/json",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
