import { describe, expect, it } from "vitest";
import { LoomError, toResult } from "@/core/errors";
import { SpotifyNeedsReconnect } from "@/spotify/access-token";

describe("toResult", () => {
  it("wraps the operation's value", async () => {
    expect(await toResult(() => Promise.resolve(["Big Thief"]))).toEqual({
      ok: true,
      value: ["Big Thief"],
    });
  });

  it("turns a LoomError into its code", async () => {
    expect(
      await toResult(() =>
        Promise.reject(new LoomError("spotify_quota_exceeded")),
      ),
    ).toEqual({ ok: false, error: "spotify_quota_exceeded" });
  });

  it("keeps the code of a more specific LoomError", async () => {
    expect(
      await toResult(() => Promise.reject(new SpotifyNeedsReconnect())),
    ).toEqual({ ok: false, error: "spotify_needs_reconnect" });
  });

  it("rethrows anything else, so bugs aren't shown as Listener messages", async () => {
    const bug = new Error("Spotify answered 404");

    await expect(toResult(() => Promise.reject(bug))).rejects.toBe(bug);
  });
});
