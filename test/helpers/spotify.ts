import { env } from "cloudflare:workers";
import { encryptToken } from "@/auth/crypto";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";

type ConnectionOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenIssuedAt?: Date;
  linkedAt?: Date;
};

const encrypt = (token: string | null) =>
  token === null ? null : encryptToken(token, env.TOKEN_ENCRYPTION_KEY);

/** A Spotify Connection as the Connect Spotify callback stores it */
export async function insertSpotifyConnection(
  listenerId: string,
  {
    accessToken = "stored-access",
    refreshToken = "stored-refresh",
    accessTokenExpiresAt = new Date("2026-11-25T13:00:00Z"),
    refreshTokenIssuedAt = new Date("2026-11-01T12:00:00Z"),
    linkedAt = new Date("2026-11-01T12:00:00Z"),
  }: ConnectionOptions = {},
) {
  await getDb(env)
    .insert(connections)
    .values({
      id: `connection-${listenerId}`,
      listenerId,
      kind: "spotify",
      externalAccountId: `spotify-${listenerId}`,
      accessTokenEnc: await encrypt(accessToken),
      refreshTokenEnc: await encrypt(refreshToken),
      accessTokenExpiresAt,
      refreshTokenIssuedAt,
      linkedAt,
    });
}
