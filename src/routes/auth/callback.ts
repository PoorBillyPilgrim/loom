import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleGoogleCallback } from "@/auth/google-callback";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }) => handleGoogleCallback(request, env),
    },
  },
});
