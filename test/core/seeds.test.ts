import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { LoomContext } from "@/core/context";
import { seedCandidates } from "@/core/seeds";
import { getDb } from "@/db/client";
import { connections, sessions } from "@/db/schema";
import searchResults from "../fixtures/spotify/search-artists.json";
import topArtists from "../fixtures/spotify/top-artists.json";
import { insertListener, signedInListener } from "../helpers/auth";
import { insertSpotifyConnection } from "../helpers/spotify";
import { network } from "../network";

const TOP_URL = "https://api.spotify.com/v1/me/top/artists";
const SEARCH_URL = "https://api.spotify.com/v1/search";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW = new Date("2026-11-25T12:00:00Z");
const MINUTE_MS = 60 * 1000;

let spotifyRequests: { authorization: string | null; url: URL }[];

function context(listenerId = "alice"): LoomContext {
  return { db: getDb(env), env, listenerId, now: NOW };
}

function record(request: { headers: Headers; url: string }) {
  spotifyRequests.push({
    authorization: request.headers.get("Authorization"),
    url: new URL(request.url),
  });
}

function spotifyAnswersWithFixtures() {
  network.use(
    http.get(TOP_URL, ({ request }) => {
      record(request);
      return HttpResponse.json(topArtists);
    }),
    http.get(SEARCH_URL, ({ request }) => {
      record(request);
      return HttpResponse.json(searchResults);
    }),
  );
}

function refreshRespondsWith(response: () => Response) {
  network.use(http.post(TOKEN_URL, () => response()));
}

const validUntil = new Date(NOW.getTime() + 30 * MINUTE_MS);

// From top-artists.json, recorded from Tyler's account
const TOP_ARTIST_NAMES = [
  "Kings of Leon",
  "The Tallest Man On Earth",
  "Grizzly Bear",
  "Radiohead",
  "Bon Iver",
  "Hudson Freeman",
  "Death Cab for Cutie",
  "Brighter Days Family",
  "Fleet Foxes",
  "Resavoir",
  "JW Francis",
  "The Belair Lip Bombs",
  "Pinegrove",
  "Geese",
  "Built To Spill",
  "alt-J",
  "Concrete Vehicles",
  "System Of A Down",
  "Father John Misty",
  "The Shins",
];

beforeEach(() => {
  spotifyRequests = [];
  spotifyAnswersWithFixtures();
});

describe("Seed candidates", () => {
  beforeEach(async () => {
    await insertListener("alice", NOW);
    await insertSpotifyConnection("alice", {
      accessToken: "alice-access",
      accessTokenExpiresAt: validUntil,
    });
  });

  it("are the Listener's short-term top artists, in Spotify's order", async () => {
    const seeds = await seedCandidates(context());

    expect(seeds.map(seed => seed.name)).toEqual(TOP_ARTIST_NAMES);
    expect(seeds[0]).toEqual({
      spotifyId: "2qk9voo8llSGYcZ6xrBzKx",
      name: "Kings of Leon",
      imageUrl:
        "https://i.scdn.co/image/ab6761610000f1784e0be890b66350e999ffb4a1",
    });
    expect(spotifyRequests).toHaveLength(1);
    expect(spotifyRequests[0].url.pathname).toBe("/v1/me/top/artists");
    expect(spotifyRequests[0].url.searchParams.get("time_range")).toBe(
      "short_term",
    );
  });

  it.each(["", "   "])(
    "treat a blank search (%j) as no search",
    async query => {
      const seeds = await seedCandidates(context(), query);

      expect(seeds.map(seed => seed.name)).toEqual(TOP_ARTIST_NAMES);
      expect(spotifyRequests.map(r => r.url.pathname)).toEqual([
        "/v1/me/top/artists",
      ]);
    },
  );

  it("search Spotify for artists, trimmed and limited to 10", async () => {
    const seeds = await seedCandidates(context(), "  big thief ");

    expect(seeds.map(seed => seed.name)).toEqual([
      "Big Thief",
      "Adrianne Lenker",
      "Buck Meek",
      "Geese",
      "Waxahatchee",
      "MJ Lenderman",
      "Big thief naruto",
      "Big Chief",
      "Big Chief Joseph Boudreaux Jr.",
      "Donald Harrison",
    ]);
    expect(seeds[0]).toEqual({
      spotifyId: "5QdyldG4Fl4TPiOIeMNpBZ",
      name: "Big Thief",
      imageUrl:
        "https://i.scdn.co/image/ab6761610000f178b2be573b9d9ca2bf7f113d92",
    });
    // Spotify's smallest image is 64 px for some artists, and missing for others
    expect(seeds[7].imageUrl).toBe(
      "https://i.scdn.co/image/ab67616d000048512cce38b10dac1e2cdfc77452",
    );
    expect(seeds[8].imageUrl).toBeNull();
    expect(spotifyRequests).toHaveLength(1);
    const { pathname, searchParams } = spotifyRequests[0].url;
    expect(pathname).toBe("/v1/search");
    expect(Object.fromEntries(searchParams)).toEqual({
      q: "big thief",
      type: "artist",
      limit: "10",
    });
  });

  it("use the Listener's own Spotify Connection", async () => {
    await insertListener("bob", NOW);
    await insertSpotifyConnection("bob", {
      accessToken: "bob-access",
      accessTokenExpiresAt: validUntil,
    });

    await seedCandidates(context("bob"));
    await seedCandidates(context("alice"), "big thief");

    expect(spotifyRequests.map(r => r.authorization)).toEqual([
      "Bearer bob-access",
      "Bearer alice-access",
    ]);
  });
});

describe("Seed candidates without a working Spotify Connection", () => {
  it("ask a Listener without a Spotify Connection to connect", async () => {
    await insertListener("alice", NOW);

    await expect(seedCandidates(context())).rejects.toMatchObject({
      code: "spotify_not_connected",
    });
    expect(spotifyRequests).toHaveLength(0);
  });

  it("ask for a reconnect, without calling Spotify, once the tokens were dropped", async () => {
    await insertListener("alice", NOW);
    await insertSpotifyConnection("alice", {
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
    });

    await expect(seedCandidates(context())).rejects.toMatchObject({
      code: "spotify_needs_reconnect",
    });
    expect(spotifyRequests).toHaveLength(0);
  });

  it("renew an expired token and still return the Seeds", async () => {
    await insertListener("alice", NOW);
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
    });
    refreshRespondsWith(() =>
      HttpResponse.json({
        access_token: "renewed-access",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    );

    const seeds = await seedCandidates(context());

    expect(seeds).toHaveLength(20);
    expect(spotifyRequests.map(r => r.authorization)).toEqual([
      "Bearer renewed-access",
    ]);
  });

  it("ask for a reconnect when Spotify's authorization has run out, and keep the Listener signed in", async () => {
    await signedInListener("alice", NOW);
    await insertSpotifyConnection("alice", {
      accessTokenExpiresAt: new Date(NOW.getTime() - MINUTE_MS),
    });
    refreshRespondsWith(() =>
      HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
    );

    await expect(seedCandidates(context())).rejects.toMatchObject({
      code: "spotify_needs_reconnect",
    });
    const db = getDb(env);
    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.listenerId, "alice"));
    expect(connection.accessTokenEnc).toBeNull();
    expect(connection.refreshTokenEnc).toBeNull();
    expect(
      await db.select().from(sessions).where(eq(sessions.listenerId, "alice")),
    ).toHaveLength(1);
    expect(spotifyRequests).toHaveLength(0);
  });
});
