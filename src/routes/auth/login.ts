import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleGoogleSignIn } from "@/auth/google-redirect";

export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: ({ request }) => handleGoogleSignIn(request, env),
    },
  },
});
