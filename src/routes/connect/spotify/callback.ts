import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { handleSpotifyCallback } from '@/connect/spotify-callback'

export const Route = createFileRoute('/connect/spotify/callback')({
  server: {
    handlers: {
      GET: ({ request }) => handleSpotifyCallback(request, env),
    },
  },
})
