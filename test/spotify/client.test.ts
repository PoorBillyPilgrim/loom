import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { spotifyGet, type SpotifyContext } from "@/spotify/client";
import quotaExceeded from "../fixtures/spotify/error-quota.json";
import { insertListener } from "../helpers/auth";
import { insertSpotifyConnection } from "../helpers/spotify";
import { network } from "../network";

const ME_URL = "https://api.spotify.com/v1/me";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW = new Date("2026-11-25T12:00:00Z");
const MINUTE_MS = 60 * 1000;

let apiRequests: { authorization: string | null; url: URL }[];
let tokenRequests: number;
let sleeps: number[];

function context(listenerId = "alice"): SpotifyContext {
  return {
    db: getDb(env),
    env,
    listenerId,
    now: NOW,
    sleep: ms => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
}

/** Answers each call with the next response; the last one repeats */
function spotifyRespondsWith(...responses: (() => Response)[]) {
  network.use(
    http.get(ME_URL, ({ request }) => {
      apiRequests.push({
        authorization: request.headers.get("Authorization"),
        url: new URL(request.url),
      });
      const next =
        responses[Math.min(apiRequests.length, responses.length) - 1];
      return next();
    }),
  );
}

function refreshRespondsWith(response: () => Response) {
  network.use(
    http.post(TOKEN_URL, () => {
      tokenRequests += 1;
      return response();
    }),
  );
}

const profile = () => HttpResponse.json({ id: "fixture-user-id" });
const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    HttpResponse.json(
      { error: { status: code, message: "…" } },
      { status: code, headers },
    );
const refreshed = () =>
  HttpResponse.json({
    access_token: "refreshed-access",
    token_type: "Bearer",
    expires_in: 3600,
  });

async function validConnection() {
  await insertSpotifyConnection("alice", {
    accessToken: "stored-access",
    accessTokenExpiresAt: new Date(NOW.getTime() + 30 * MINUTE_MS),
  });
}

beforeEach(async () => {
  apiRequests = [];
  tokenRequests = 0;
  sleeps = [];
  await insertListener("alice", NOW);
});

describe("Spotify client", () => {
  it("calls the Web API with the Listener's token and query parameters", async () => {
    await validConnection();
    spotifyRespondsWith(profile);

    const body = await spotifyGet(context(), "/me", { market: "from_token" });

    expect(body).toEqual({ id: "fixture-user-id" });
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0].authorization).toBe("Bearer stored-access");
    expect(apiRequests[0].url.searchParams.get("market")).toBe("from_token");
    expect(tokenRequests).toBe(0);
  });

  it("renews an expired token before the call", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
    });
    refreshRespondsWith(refreshed);
    spotifyRespondsWith(profile);

    await spotifyGet(context(), "/me");

    expect(tokenRequests).toBe(1);
    expect(apiRequests.map(r => r.authorization)).toEqual([
      "Bearer refreshed-access",
    ]);
  });

  describe("a 401", () => {
    it("renews the token once and retries", async () => {
      await validConnection();
      refreshRespondsWith(refreshed);
      spotifyRespondsWith(status(401), profile);

      const body = await spotifyGet(context(), "/me");

      expect(body).toEqual({ id: "fixture-user-id" });
      expect(tokenRequests).toBe(1);
      expect(apiRequests.map(r => r.authorization)).toEqual([
        "Bearer stored-access",
        "Bearer refreshed-access",
      ]);
    });

    it("fails after a second 401 without retrying again", async () => {
      await validConnection();
      refreshRespondsWith(refreshed);
      spotifyRespondsWith(status(401));

      const result = spotifyGet(context(), "/me");

      await expect(result).rejects.toThrow();
      await expect(result).rejects.not.toHaveProperty("code");
      expect(apiRequests).toHaveLength(2);
      expect(tokenRequests).toBe(1);
    });

    it("asks for a reconnect when the renewal answers invalid_grant", async () => {
      await validConnection();
      refreshRespondsWith(() =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      );
      spotifyRespondsWith(status(401));

      await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
        code: "spotify_needs_reconnect",
      });
      const [row] = await getDb(env)
        .select()
        .from(connections)
        .where(eq(connections.listenerId, "alice"));
      expect(row.refreshTokenEnc).toBeNull();
      expect(apiRequests).toHaveLength(1);
    });
  });

  describe("a 429", () => {
    it("reports Spotify's quota without retrying", async () => {
      await validConnection();
      spotifyRespondsWith(() =>
        HttpResponse.json(quotaExceeded, {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      );

      await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
        code: "spotify_quota_exceeded",
      });
      expect(apiRequests).toHaveLength(1);
      expect(sleeps).toEqual([]);
    });

    it.each(["2", "3"])(
      "waits out a Retry-After of %s seconds and retries once",
      async retryAfter => {
        await validConnection();
        spotifyRespondsWith(
          status(429, { "Retry-After": retryAfter }),
          profile,
        );

        const body = await spotifyGet(context(), "/me");

        expect(body).toEqual({ id: "fixture-user-id" });
        expect(sleeps).toEqual([Number(retryAfter) * 1000]);
        expect(apiRequests).toHaveLength(2);
      },
    );

    it("reports a rate limit when the retry is limited too", async () => {
      await validConnection();
      spotifyRespondsWith(status(429, { "Retry-After": "2" }));

      await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
        code: "spotify_rate_limited",
      });
      expect(apiRequests).toHaveLength(2);
      expect(sleeps).toEqual([2000]);
    });

    it.each([
      ["a longer Retry-After", { "Retry-After": "4" }],
      ["no Retry-After", {}],
      ["a Retry-After that isn't a number", { "Retry-After": "soon" }],
    ])(
      "reports a rate limit without waiting for %s",
      async (_case, headers) => {
        await validConnection();
        spotifyRespondsWith(status(429, headers));

        await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
          code: "spotify_rate_limited",
        });
        expect(apiRequests).toHaveLength(1);
        expect(sleeps).toEqual([]);
      },
    );
  });

  it.each([500, 503])(
    "reports a %i as Spotify being unavailable",
    async code => {
      await validConnection();
      spotifyRespondsWith(status(code));

      await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
        code: "spotify_unavailable",
      });
    },
  );

  it("reports a network failure as Spotify being unavailable", async () => {
    await validConnection();
    spotifyRespondsWith(() => HttpResponse.error());

    await expect(spotifyGet(context(), "/me")).rejects.toMatchObject({
      code: "spotify_unavailable",
    });
  });

  it("treats any other error as a Loom bug, not a Listener message", async () => {
    await validConnection();
    spotifyRespondsWith(status(404));

    const result = spotifyGet(context(), "/me");

    await expect(result).rejects.toThrow("404");
    await expect(result).rejects.not.toHaveProperty("code");
  });
});
