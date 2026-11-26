import { expect, it } from "vitest";

it("blocks outbound requests that no test mocked", async () => {
  await expect(fetch("https://api.spotify.com/v1/me")).rejects.toThrow(
    /\[MSW\]/,
  );
});
