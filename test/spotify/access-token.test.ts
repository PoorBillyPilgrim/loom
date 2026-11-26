import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken } from "@/auth/crypto";
import { spotifyStatus } from "@/connect/status";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import {
  SpotifyNeedsReconnect,
  SpotifyNotConnected,
  spotifyAccessToken,
} from "@/spotify/access-token";
import { insertListener } from "../helpers/auth";
import { insertSpotifyConnection } from "../helpers/spotify";
import { network } from "../network";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW = new Date("2026-11-25T12:00:00Z");
const ISSUED = new Date("2026-11-01T12:00:00Z");
const MINUTE_MS = 60 * 1000;

let tokenRequests: { authorization: string | null; body: URLSearchParams }[];

function spotifyRefreshRespondsWith(response: () => Response) {
  network.use(
    http.post(TOKEN_URL, async ({ request }) => {
      tokenRequests.push({
        authorization: request.headers.get("Authorization"),
        body: new URLSearchParams(await request.text()),
      });
      return response();
    }),
  );
}

const refreshed = (extra: object = {}) =>
  HttpResponse.json({
    access_token: "new-access",
    token_type: "Bearer",
    scope: "user-top-read",
    expires_in: 3600,
    ...extra,
  });

async function storedConnection() {
  const [row] = await getDb(env)
    .select()
    .from(connections)
    .where(eq(connections.listenerId, "alice"));
  return row;
}

const decrypt = (token: string | null) =>
  token === null ? null : decryptToken(token, env.TOKEN_ENCRYPTION_KEY);

beforeEach(async () => {
  tokenRequests = [];
  await insertListener("alice", ISSUED);
});

describe("Spotify access token", () => {
  it("returns the stored token while it is still valid, without asking Spotify", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() + 30 * MINUTE_MS),
    });

    const token = await spotifyAccessToken(getDb(env), env, "alice", NOW);

    expect(token).toBe("stored-access");
    expect(tokenRequests).toHaveLength(0);
  });

  it("refreshes an expired token and stores the new one encrypted", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
      refreshTokenIssuedAt: ISSUED,
    });
    spotifyRefreshRespondsWith(() => refreshed());

    const token = await spotifyAccessToken(getDb(env), env, "alice", NOW);

    expect(token).toBe("new-access");
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].authorization).toBe(
      `Basic ${btoa("test-client-id:test-client-secret")}`,
    );
    expect(Object.fromEntries(tokenRequests[0].body)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "stored-refresh",
    });
    const row = await storedConnection();
    expect(row.accessTokenEnc).not.toContain("new-access");
    expect(await decrypt(row.accessTokenEnc)).toBe("new-access");
    expect(row.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + 3600 * 1000),
    );
    expect(await decrypt(row.refreshTokenEnc)).toBe("stored-refresh");
    expect(row.refreshTokenIssuedAt).toEqual(ISSUED);
  });

  it("refreshes a token that expires within a minute", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 1000),
    });
    spotifyRefreshRespondsWith(() => refreshed());

    const token = await spotifyAccessToken(getDb(env), env, "alice", NOW);

    expect(token).toBe("new-access");
    expect(tokenRequests).toHaveLength(1);
  });

  it("stores a rotated refresh token without restarting its 6-month clock", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
      refreshTokenIssuedAt: ISSUED,
    });
    spotifyRefreshRespondsWith(() =>
      refreshed({ refresh_token: "rotated-refresh" }),
    );

    await spotifyAccessToken(getDb(env), env, "alice", NOW);

    const row = await storedConnection();
    expect(await decrypt(row.refreshTokenEnc)).toBe("rotated-refresh");
    expect(row.refreshTokenIssuedAt).toEqual(ISSUED);
  });

  it("drops the tokens and asks for a reconnect when Spotify answers invalid_grant", async () => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
    });
    spotifyRefreshRespondsWith(() =>
      HttpResponse.json(
        { error: "invalid_grant", error_description: "Refresh token revoked" },
        { status: 400 },
      ),
    );

    await expect(
      spotifyAccessToken(getDb(env), env, "alice", NOW),
    ).rejects.toBeInstanceOf(SpotifyNeedsReconnect);

    const row = await storedConnection();
    expect(row).toMatchObject({
      accessTokenEnc: null,
      refreshTokenEnc: null,
      accessTokenExpiresAt: null,
    });
    expect(await spotifyStatus(getDb(env), "alice")).toBe("needs-reconnect");
  });

  it("asks for a reconnect without calling Spotify once the tokens were dropped", async () => {
    await insertSpotifyConnection("alice", {
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
    });
    spotifyRefreshRespondsWith(() => refreshed());

    await expect(
      spotifyAccessToken(getDb(env), env, "alice", NOW),
    ).rejects.toBeInstanceOf(SpotifyNeedsReconnect);
    expect(tokenRequests).toHaveLength(0);
  });

  it.each([
    ["Spotify is down", () => new HttpResponse(null, { status: 503 })],
    [
      "Spotify rejects Loom's own credentials",
      () => HttpResponse.json({ error: "invalid_client" }, { status: 400 }),
    ],
  ])("keeps the tokens when %s", async (_case, response) => {
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
    });
    const before = await storedConnection();
    spotifyRefreshRespondsWith(response);

    const result = spotifyAccessToken(getDb(env), env, "alice", NOW);

    await expect(result).rejects.toThrow();
    await expect(result).rejects.not.toBeInstanceOf(SpotifyNeedsReconnect);
    expect(await storedConnection()).toEqual(before);
    expect(await spotifyStatus(getDb(env), "alice")).toBe("connected");
  });

  it("reports a Listener who never connected Spotify", async () => {
    await expect(
      spotifyAccessToken(getDb(env), env, "alice", NOW),
    ).rejects.toBeInstanceOf(SpotifyNotConnected);
  });
});
