import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { handleLogin } from '@/auth/login'

export const Route = createFileRoute('/auth/login')({
  server: {
    handlers: {
      GET: ({ request }) => handleLogin(request, env),
    },
  },
})
