import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { handleLogout } from '@/auth/logout'
import { createSession, currentListener } from '@/auth/session'
import { getDb } from '@/db/client'
import { listeners, sessions } from '@/db/schema'
import { LOCAL_ORIGIN, responseCookies } from '../helpers/auth'

const NOW = new Date('2026-11-25T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

async function insertListener(id = 'listener-1') {
  await getDb(env)
    .insert(listeners)
    .values({ id, spotifyAccountId: `account-${id}`, createdAt: NOW })
  return id
}

function requestWithSession(cookieValue?: string, path = '/', method = 'GET') {
  return new Request(`${LOCAL_ORIGIN}${path}`, {
    method,
    headers: cookieValue ? { Cookie: `theme=dark; loom_session=${cookieValue}` } : {},
  })
}

describe('current Listener', () => {
  it('is the Listener whose session cookie is valid', async () => {
    const db = getDb(env)
    const id = await insertListener()
    const cookie = await createSession(db, id, NOW)

    expect(await currentListener(requestWithSession(cookie), db, NOW)).toEqual({ id })
  })

  it('is still logged in on day 29', async () => {
    const db = getDb(env)
    const id = await insertListener()
    const cookie = await createSession(db, id, NOW)

    const day29 = new Date(NOW.getTime() + 29 * DAY_MS)
    expect(await currentListener(requestWithSession(cookie), db, day29)).toEqual({ id })
  })

  it('is logged out once the session expires after 30 days', async () => {
    const db = getDb(env)
    const id = await insertListener()
    const cookie = await createSession(db, id, NOW)

    const day31 = new Date(NOW.getTime() + 31 * DAY_MS)
    expect(await currentListener(requestWithSession(cookie), db, day31)).toBeNull()
  })

  it('is logged out with an unknown cookie or no cookie', async () => {
    const db = getDb(env)
    await createSession(db, await insertListener(), NOW)

    expect(await currentListener(requestWithSession('not-a-real-session'), db, NOW)).toBeNull()
    expect(await currentListener(requestWithSession(), db, NOW)).toBeNull()
  })
})

describe('Log out', () => {
  it('ends the session, clears the cookie, and returns home', async () => {
    const db = getDb(env)
    const cookie = await createSession(db, await insertListener(), NOW)

    const response = await handleLogout(requestWithSession(cookie, '/auth/logout', 'POST'), env)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/')
    expect(responseCookies(response).get('loom_session')).toEqual({
      value: '',
      attributes: expect.arrayContaining(['Max-Age=0', 'Path=/']),
    })
    expect(await currentListener(requestWithSession(cookie), db, NOW)).toBeNull()
  })

  it("leaves the Listener's other sessions alone", async () => {
    const db = getDb(env)
    const id = await insertListener()
    const laptop = await createSession(db, id, NOW)
    const phone = await createSession(db, id, NOW)

    await handleLogout(requestWithSession(laptop, '/auth/logout', 'POST'), env)

    expect(await currentListener(requestWithSession(phone), db, NOW)).toEqual({ id })
    expect(await db.select().from(sessions)).toHaveLength(1)
  })

  it('returns home even without a session', async () => {
    const response = await handleLogout(requestWithSession(undefined, '/auth/logout', 'POST'), env)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/')
  })
})
