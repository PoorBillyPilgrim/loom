import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { spotifyStatus } from "@/connect/status";
import { getDb } from "@/db/client";
import { insertListener } from "../helpers/auth";
import { insertSpotifyConnection } from "../helpers/spotify";

const NOW = new Date("2026-11-25T12:00:00Z");

describe("Spotify status", () => {
  it("is none before the Listener connects Spotify", async () => {
    await insertListener("alice", NOW);

    expect(await spotifyStatus(getDb(env), "alice")).toBe("none");
  });

  it("is connected only for the Listener who connected", async () => {
    await insertListener("alice", NOW);
    await insertListener("bob", NOW);
    await insertSpotifyConnection("alice");

    expect(await spotifyStatus(getDb(env), "alice")).toBe("connected");
    expect(await spotifyStatus(getDb(env), "bob")).toBe("none");
  });

  it("needs a reconnect once Spotify's authorization was dropped", async () => {
    await insertListener("alice", NOW);
    await insertSpotifyConnection("alice", {
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
    });

    expect(await spotifyStatus(getDb(env), "alice")).toBe("needs-reconnect");
  });
});
