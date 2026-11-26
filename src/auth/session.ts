import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { sessions } from '@/db/schema'
import { readCookie, serializeCookie } from './cookies'
import { randomToken } from './pkce'

export const SESSION_COOKIE = 'loom_session'

const SESSION_DAYS = 30
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60

export async function hashSessionId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSession(db: Db, listenerId: string, now: Date): Promise<string> {
  const value = randomToken(32)
  await db.insert(sessions).values({
    idHash: await hashSessionId(value),
    listenerId,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000),
    createdAt: now,
  })
  return value
}

export async function currentListener(
  request: Request,
  db: Db,
  now: Date,
): Promise<{ id: string } | null> {
  const value = readCookie(request, SESSION_COOKIE)
  if (!value) return null

  const [session] = await db
    .select({ listenerId: sessions.listenerId })
    .from(sessions)
    .where(and(eq(sessions.idHash, await hashSessionId(value)), gt(sessions.expiresAt, now)))
  return session ? { id: session.listenerId } : null
}

export function sessionCookie(request: Request, value: string): string {
  return serializeCookie(request, SESSION_COOKIE, value, { path: '/', maxAge: SESSION_MAX_AGE })
}

export function clearedSessionCookie(request: Request): string {
  return serializeCookie(request, SESSION_COOKIE, '', { path: '/', maxAge: 0 })
}
