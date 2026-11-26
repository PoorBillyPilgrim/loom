import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { currentListener } from "@/auth/session";
import { getDb } from "@/db/client";

export const getLoginState = createServerFn({ method: "GET" }).handler(
  async () => {
    const listener = await currentListener(
      getRequest(),
      getDb(env),
      new Date(),
    );
    return { loggedIn: listener !== null };
  },
);
