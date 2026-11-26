import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { sessions } from '@/db/schema'
import { readCookie, redirect } from './cookies'
import { SESSION_COOKIE, clearedSessionCookie, hashSessionId } from './session'

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const value = readCookie(request, SESSION_COOKIE)
  if (value) {
    await getDb(env)
      .delete(sessions)
      .where(eq(sessions.idHash, await hashSessionId(value)))
  }
  return redirect('/', [clearedSessionCookie(request)])
}
