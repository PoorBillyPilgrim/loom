import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleConnectSpotify } from "@/connect/spotify-redirect";

export const Route = createFileRoute("/connect/spotify/")({
  server: {
    handlers: {
      GET: ({ request }) => handleConnectSpotify(request, env),
    },
  },
});
