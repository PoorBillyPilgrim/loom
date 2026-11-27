import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { handleSpotifyProxy } from "@/dev/spotify-proxy";
import topArtists from "../fixtures/spotify/top-artists.json";
import {
  DEPLOYED_ORIGIN,
  LOCAL_ORIGIN,
  signedInListener,
} from "../helpers/auth";
import { insertSpotifyConnection } from "../helpers/spotify";
import { network } from "../network";

const NOW = new Date("2026-11-25T12:00:00Z");
const RECORDING = { ...env, LOOM_RECORD_FIXTURES: "true" };

let spotifyRequests: { authorization: string | null; url: URL }[];
let sessionCookie: string;

function spotifyAnswers(response: () => Response) {
  network.use(
    http.get("https://api.spotify.com/v1/*", ({ request }) => {
      spotifyRequests.push({
        authorization: request.headers.get("Authorization"),
        url: new URL(request.url),
      });
      return response();
    }),
  );
}

function proxyRequest(
  path: string,
  { origin = LOCAL_ORIGIN, method = "GET", cookie = sessionCookie } = {},
) {
  return new Request(`${origin}/dev/spotify${path}`, {
    method,
    headers: cookie ? { Cookie: cookie } : {},
  });
}

beforeEach(async () => {
  spotifyRequests = [];
  ({ sessionCookie } = await signedInListener("alice", NOW));
  await insertSpotifyConnection("alice", {
    accessToken: "alice-access",
    accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
  });
  spotifyAnswers(() => HttpResponse.json(topArtists));
});

describe("Spotify fixture recording", () => {
  it("returns Spotify's JSON for the signed-in Listener's path and query", async () => {
    const response = await handleSpotifyProxy(
      proxyRequest("/me/top/artists?time_range=short_term"),
      RECORDING,
      NOW,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type") ?? "").toContain(
      "application/json",
    );
    expect(await response.json()).toEqual(topArtists);
    expect(spotifyRequests).toHaveLength(1);
    expect(spotifyRequests[0].authorization).toBe("Bearer alice-access");
    expect(spotifyRequests[0].url.pathname).toBe("/v1/me/top/artists");
    expect(spotifyRequests[0].url.search).toBe("?time_range=short_term");
  });

  it("passes Spotify's errors through, so request shapes can be checked", async () => {
    const invalid = { error: { status: 400, message: "Invalid base62 id" } };
    spotifyAnswers(() => HttpResponse.json(invalid, { status: 400 }));

    const response = await handleSpotifyProxy(
      proxyRequest("/me/library/contains?uris=spotify:artist:nope"),
      RECORDING,
      NOW,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(invalid);
  });

  it("names the problem when the Listener's Spotify Connection can't be used", async () => {
    const { sessionCookie: bobCookie } = await signedInListener("bob", NOW);

    const response = await handleSpotifyProxy(
      proxyRequest("/me", { cookie: bobCookie }),
      RECORDING,
      NOW,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "spotify_not_connected" });
    expect(spotifyRequests).toHaveLength(0);
  });

  describe("is a 404 that never calls Spotify", () => {
    it.each([undefined, "", "false", "1"])(
      "when LOOM_RECORD_FIXTURES is %j",
      async flag => {
        const response = await handleSpotifyProxy(
          proxyRequest("/me"),
          { ...env, LOOM_RECORD_FIXTURES: flag },
          NOW,
        );

        expect(response.status).toBe(404);
        expect(spotifyRequests).toHaveLength(0);
      },
    );

    it.each([DEPLOYED_ORIGIN, "http://localhost:8787"])(
      "when served from %s",
      async origin => {
        const response = await handleSpotifyProxy(
          proxyRequest("/me", { origin }),
          RECORDING,
          NOW,
        );

        expect(response.status).toBe(404);
        expect(spotifyRequests).toHaveLength(0);
      },
    );

    it("for anything but GET", async () => {
      const response = await handleSpotifyProxy(
        proxyRequest("/me/library", { method: "PUT" }),
        RECORDING,
        NOW,
      );

      expect(response.status).toBe(404);
      expect(spotifyRequests).toHaveLength(0);
    });

    it("without a session", async () => {
      const response = await handleSpotifyProxy(
        proxyRequest("/me", { cookie: "" }),
        RECORDING,
        NOW,
      );

      expect(response.status).toBe(404);
      expect(spotifyRequests).toHaveLength(0);
    });
  });
});
