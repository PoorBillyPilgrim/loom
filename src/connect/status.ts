import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { connections } from "@/db/schema";

export type SpotifyStatus = "none" | "connected";

export async function spotifyStatus(
  db: Db,
  listenerId: string,
): Promise<SpotifyStatus> {
  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.listenerId, listenerId),
        eq(connections.kind, "spotify"),
      ),
    );
  return connection ? "connected" : "none";
}
