import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { handleCallback } from '@/auth/callback'

export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: ({ request }) => handleCallback(request, env),
    },
  },
})
