import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { currentListener } from "@/auth/session";
import { spotifyStatus, type SpotifyStatus } from "@/connect/status";
import { getDb } from "@/db/client";

export const getSpotifyStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpotifyStatus> => {
    const db = getDb(env);
    const listener = await currentListener(getRequest(), db, new Date());
    return listener ? spotifyStatus(db, listener.id) : "none";
  },
);
