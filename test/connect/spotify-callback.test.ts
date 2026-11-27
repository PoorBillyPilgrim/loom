import { env } from "cloudflare:workers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken } from "@/auth/crypto";
import { handleSpotifyCallback } from "@/connect/spotify-callback";
import { getDb } from "@/db/client";
import { connections, sessions } from "@/db/schema";
import {
  SpotifyNeedsReconnect,
  spotifyAccessToken,
} from "@/spotify/access-token";
import me from "../fixtures/spotify/me.json";
import token from "../fixtures/spotify/token.json";
import {
  responseCookies,
  signedInListener,
  spotifyCallbackRequest,
  startSpotifyConnect,
} from "../helpers/auth";
import { network } from "../network";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const ME_URL = "https://api.spotify.com/v1/me";
const NOW = new Date("2026-11-25T12:00:00Z");
const LATER = new Date("2026-12-01T12:00:00Z");

let tokenRequests: { authorization: string | null; body: URLSearchParams }[];

function spotifyRespondsWith(
  tokenBody: object = token,
  meResponse = () => HttpResponse.json(me),
) {
  network.use(
    http.post(TOKEN_URL, async ({ request }) => {
      tokenRequests.push({
        authorization: request.headers.get("Authorization"),
        body: new URLSearchParams(await request.text()),
      });
      return HttpResponse.json(tokenBody);
    }),
    http.get(ME_URL, meResponse),
  );
}

async function completeConnect(sessionCookie: string, now = NOW) {
  const { state, pkceCookie, verifier } =
    await startSpotifyConnect(sessionCookie);
  const response = await handleSpotifyCallback(
    spotifyCallbackRequest({ code: "spotify-code", state }, [
      sessionCookie,
      pkceCookie,
    ]),
    env,
    now,
  );
  return { response, verifier };
}

beforeEach(() => {
  tokenRequests = [];
});

describe("Connect Spotify callback", () => {
  it("exchanges the code with the stored verifier", async () => {
    spotifyRespondsWith();
    const { sessionCookie } = await signedInListener("listener-1", NOW);

    const { verifier } = await completeConnect(sessionCookie);

    expect(tokenRequests).toHaveLength(1);
    const [request] = tokenRequests;
    expect(request.authorization).toBe(
      `Basic ${btoa("test-client-id:test-client-secret")}`,
    );
    expect(Object.fromEntries(request.body)).toEqual({
      grant_type: "authorization_code",
      code: "spotify-code",
      redirect_uri: "http://127.0.0.1:8787/connect/spotify/callback",
      code_verifier: verifier,
    });
  });

  it("stores a Spotify Connection on the signed-in Listener and returns to Explore", async () => {
    spotifyRespondsWith();
    const { id, sessionCookie } = await signedInListener("listener-1", NOW);

    const { response } = await completeConnect(sessionCookie);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/explore");
    const rows = await getDb(env).select().from(connections);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      listenerId: id,
      kind: "spotify",
      externalAccountId: "fixture-account-id",
      linkedAt: NOW,
    });
  });

  it("connects each Listener to their own Spotify account", async () => {
    const alice = await signedInListener("alice", NOW);
    const bob = await signedInListener("bob", NOW);

    spotifyRespondsWith(token, () =>
      HttpResponse.json({ ...me, account_id: "alice-spotify" }),
    );
    await completeConnect(alice.sessionCookie);
    network.resetHandlers();
    spotifyRespondsWith(token, () =>
      HttpResponse.json({ ...me, account_id: "bob-spotify" }),
    );
    await completeConnect(bob.sessionCookie);

    const rows = await getDb(env).select().from(connections);
    expect(
      rows.map(({ listenerId, externalAccountId }) => ({
        listenerId,
        externalAccountId,
      })),
    ).toEqual(
      expect.arrayContaining([
        { listenerId: "alice", externalAccountId: "alice-spotify" },
        { listenerId: "bob", externalAccountId: "bob-spotify" },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("clears the PKCE cookie and leaves the session alone", async () => {
    spotifyRespondsWith();
    const { sessionCookie } = await signedInListener("listener-1", NOW);

    const { response } = await completeConnect(sessionCookie);

    const cookies = responseCookies(response);
    expect(cookies.get("loom_pkce")).toEqual({
      value: "",
      attributes: expect.arrayContaining([
        "Max-Age=0",
        "Path=/connect/spotify",
      ]),
    });
    expect(cookies.has("loom_session")).toBe(false);
    expect(await getDb(env).select().from(sessions)).toHaveLength(1);
  });

  it("stores Spotify tokens encrypted", async () => {
    spotifyRespondsWith();
    const { sessionCookie } = await signedInListener("listener-1", NOW);

    await completeConnect(sessionCookie);

    const rows = await getDb(env).select().from(connections);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.accessTokenEnc).not.toContain("fixture-access-token");
    expect(row.refreshTokenEnc).not.toContain("fixture-refresh-token");
    expect(
      await decryptToken(row.accessTokenEnc!, env.TOKEN_ENCRYPTION_KEY),
    ).toBe("fixture-access-token");
    expect(
      await decryptToken(row.refreshTokenEnc!, env.TOKEN_ENCRYPTION_KEY),
    ).toBe("fixture-refresh-token");
    expect(row.accessTokenExpiresAt).toEqual(
      new Date(NOW.getTime() + 3600 * 1000),
    );
    expect(row.refreshTokenIssuedAt).toEqual(NOW);
  });

  it("updates the same Connection when the Listener reconnects", async () => {
    spotifyRespondsWith();
    const { sessionCookie } = await signedInListener("listener-1", NOW);
    await completeConnect(sessionCookie);
    const [first] = await getDb(env).select().from(connections);

    network.resetHandlers();
    spotifyRespondsWith({ ...token, access_token: "second-access-token" });
    await completeConnect(sessionCookie, LATER);

    const rows = await getDb(env).select().from(connections);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].linkedAt).toEqual(NOW);
    // Each authorization restarts Spotify's 6-month refresh token clock
    expect(rows[0].refreshTokenIssuedAt).toEqual(LATER);
    expect(
      await decryptToken(rows[0].accessTokenEnc!, env.TOKEN_ENCRYPTION_KEY),
    ).toBe("second-access-token");
  });

  describe("failed connections create no Connection", () => {
    async function expectRedirectWithoutConnection(
      response: Response,
      location: string,
    ) {
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(location);
      expect(await getDb(env).select().from(connections)).toHaveLength(0);
    }

    it("sends a callback without a session to sign in", async () => {
      spotifyRespondsWith();
      const { sessionCookie } = await signedInListener("listener-1", NOW);
      const { state, pkceCookie } = await startSpotifyConnect(sessionCookie);

      const response = await handleSpotifyCallback(
        spotifyCallbackRequest({ code: "spotify-code", state }, [pkceCookie]),
        env,
        NOW,
      );

      await expectRedirectWithoutConnection(response, "/auth/login");
      expect(tokenRequests).toHaveLength(0);
    });

    it("rejects a state mismatch as an expired link", async () => {
      spotifyRespondsWith();
      const { sessionCookie } = await signedInListener("listener-1", NOW);
      const { pkceCookie } = await startSpotifyConnect(sessionCookie);

      const response = await handleSpotifyCallback(
        spotifyCallbackRequest(
          { code: "spotify-code", state: "forged-state" },
          [sessionCookie, pkceCookie],
        ),
        env,
        NOW,
      );

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=expired",
      );
      expect(tokenRequests).toHaveLength(0);
    });

    it("treats a reloaded callback without the PKCE cookie as expired", async () => {
      spotifyRespondsWith();
      const { sessionCookie } = await signedInListener("listener-1", NOW);
      const { state } = await startSpotifyConnect(sessionCookie);

      const response = await handleSpotifyCallback(
        spotifyCallbackRequest({ code: "spotify-code", state }, [
          sessionCookie,
        ]),
        env,
        NOW,
      );

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=expired",
      );
      expect(tokenRequests).toHaveLength(0);
    });

    it("treats a code Spotify rejects as expired", async () => {
      network.use(
        http.post(TOKEN_URL, () =>
          HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
        ),
      );
      const { sessionCookie } = await signedInListener("listener-1", NOW);

      const { response } = await completeConnect(sessionCookie);

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=expired",
      );
    });

    it("tells a Listener missing from the Spotify allowlist that access is limited", async () => {
      spotifyRespondsWith(token, () =>
        HttpResponse.text("User not registered in the Developer Dashboard", {
          status: 403,
        }),
      );
      const { sessionCookie } = await signedInListener("listener-1", NOW);

      const { response } = await completeConnect(sessionCookie);

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=limited",
      );
    });

    it("reports a cancelled Spotify connection", async () => {
      spotifyRespondsWith();
      const { sessionCookie } = await signedInListener("listener-1", NOW);
      const { state, pkceCookie } = await startSpotifyConnect(sessionCookie);

      const response = await handleSpotifyCallback(
        spotifyCallbackRequest({ error: "access_denied", state }, [
          sessionCookie,
          pkceCookie,
        ]),
        env,
        NOW,
      );

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=denied",
      );
      expect(tokenRequests).toHaveLength(0);
    });

    it("reports a Spotify outage as a failed connection", async () => {
      spotifyRespondsWith(token, () => new HttpResponse(null, { status: 503 }));
      const { sessionCookie } = await signedInListener("listener-1", NOW);

      const { response } = await completeConnect(sessionCookie);

      await expectRedirectWithoutConnection(
        response,
        "/explore?spotify=failed",
      );
    });
  });

  describe("a Spotify account connected to another Listener", () => {
    async function connectAs(
      sessionCookie: string,
      accountId: string,
      now = NOW,
    ) {
      network.resetHandlers();
      spotifyRespondsWith(token, () =>
        HttpResponse.json({ ...me, account_id: accountId }),
      );
      return completeConnect(sessionCookie, now);
    }

    it("is refused for a Listener without Spotify", async () => {
      const alice = await signedInListener("alice", NOW);
      const bob = await signedInListener("bob", NOW);
      await connectAs(alice.sessionCookie, "alice-spotify");
      const before = await getDb(env).select().from(connections);

      const { response } = await connectAs(bob.sessionCookie, "alice-spotify");

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/explore?spotify=taken");
      expect(responseCookies(response).get("loom_pkce")?.attributes).toEqual(
        expect.arrayContaining(["Max-Age=0"]),
      );
      expect(await getDb(env).select().from(connections)).toEqual(before);
    });

    it("leaves both Connections unchanged when a connected Listener tries it", async () => {
      const alice = await signedInListener("alice", NOW);
      const bob = await signedInListener("bob", NOW);
      await connectAs(alice.sessionCookie, "alice-spotify");
      await connectAs(bob.sessionCookie, "bob-spotify");
      const before = await getDb(env).select().from(connections);

      const { response } = await connectAs(
        bob.sessionCookie,
        "alice-spotify",
        LATER,
      );

      expect(response.headers.get("Location")).toBe("/explore?spotify=taken");
      expect(await getDb(env).select().from(connections)).toEqual(before);
    });
  });

  it("restores the same Connection when the Listener reconnects after invalid_grant", async () => {
    const { id, sessionCookie } = await signedInListener("alice", NOW);
    spotifyRespondsWith();
    await completeConnect(sessionCookie);
    const [connected] = await getDb(env).select().from(connections);

    network.resetHandlers();
    network.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      spotifyAccessToken(getDb(env), env, id, LATER),
    ).rejects.toBeInstanceOf(SpotifyNeedsReconnect);
    const [dropped] = await getDb(env).select().from(connections);
    expect(dropped.refreshTokenEnc).toBeNull();

    network.resetHandlers();
    spotifyRespondsWith({ ...token, access_token: "reconnected-access" });
    await completeConnect(sessionCookie, LATER);

    const rows = await getDb(env).select().from(connections);
    expect(rows).toHaveLength(1);
    expect(rows[0].refreshTokenEnc).not.toBeNull();
    expect(rows[0].id).toBe(connected.id);
    expect(rows[0].refreshTokenIssuedAt).toEqual(LATER);
    expect(
      await decryptToken(rows[0].accessTokenEnc!, env.TOKEN_ENCRYPTION_KEY),
    ).toBe("reconnected-access");
  });
});
