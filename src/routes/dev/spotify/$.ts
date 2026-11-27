import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { handleSpotifyProxy } from "@/dev/spotify-proxy";

export const Route = createFileRoute("/dev/spotify/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleSpotifyProxy(request, env),
    },
  },
});
