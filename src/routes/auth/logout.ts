import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { handleLogout } from '@/auth/logout'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) => handleLogout(request, env),
    },
  },
})
