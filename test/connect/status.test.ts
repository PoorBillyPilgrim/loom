import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { spotifyStatus } from "@/connect/status";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { insertListener } from "../helpers/auth";

const NOW = new Date("2026-11-25T12:00:00Z");

async function insertSpotifyConnection(listenerId: string) {
  await getDb(env)
    .insert(connections)
    .values({
      id: `connection-${listenerId}`,
      listenerId,
      kind: "spotify",
      externalAccountId: `spotify-${listenerId}`,
      accessTokenEnc: "encrypted-access",
      refreshTokenEnc: "encrypted-refresh",
      accessTokenExpiresAt: new Date(NOW.getTime() + 3600 * 1000),
      refreshTokenIssuedAt: NOW,
      linkedAt: NOW,
    });
}

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
});
