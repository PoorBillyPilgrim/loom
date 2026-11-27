import type { Db } from "@/db/client";

/** Every Loom core operation runs as one Listener */
export type LoomContext = {
  db: Db;
  env: Env;
  listenerId: string;
  now: Date;
};
