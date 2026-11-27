import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { type } from "arktype";
import { env } from "cloudflare:workers";
import { currentListener } from "@/auth/session";
import { toResult, type Result } from "@/core/errors";
import { seedCandidates, type Seed } from "@/core/seeds";
import { getDb } from "@/db/client";

export const getSeedCandidates = createServerFn({ method: "GET" })
  .validator(type({ "q?": "string" }))
  .handler(async ({ data }): Promise<Result<Seed[]>> => {
    const db = getDb(env);
    const now = new Date();
    const listener = await currentListener(getRequest(), db, now);
    if (!listener) return { ok: false, error: "not_signed_in" };
    return toResult(() =>
      seedCandidates({ db, env, listenerId: listener.id, now }, data.q),
    );
  });
