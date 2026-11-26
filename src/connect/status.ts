import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connections } from "@/db/schema";

export type SpotifyStatus = "none" | "connected" | "needs-reconnect";

export async function spotifyStatus(
  db: Db,
  listenerId: string,
): Promise<SpotifyStatus> {
  const [connection] = await db
    .select({ refreshTokenEnc: connections.refreshTokenEnc })
    .from(connections)
    .where(
      and(
        eq(connections.listenerId, listenerId),
        eq(connections.kind, "spotify"),
      ),
    );
  if (!connection) return "none";
  // Loom drops the tokens when Spotify's 6-month authorization runs out
  return connection.refreshTokenEnc ? "connected" : "needs-reconnect";
}
