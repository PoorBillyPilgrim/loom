import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { handleCallback } from '@/auth/callback'
import { getDb } from '@/db/client'
import { invites, listeners, sessions } from '@/db/schema'
import {
  DEPLOYED_ORIGIN,
  LOCAL_ORIGIN,
  invite,
  responseCookies,
  sha256Hex,
  signInCallbackRequest,
  startSignIn,
} from '../helpers/auth'
import {
  type GoogleTokenRequest,
  forgedKey,
  googleRespondsWith,
  idTokenClaims,
  signIdToken,
} from '../helpers/google'
import { network } from '../network'

const NOW = new Date('2026-11-25T12:00:00Z')
const LATER = new Date('2026-12-01T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let tokenRequests: GoogleTokenRequest[]

type SignInOptions = {
  claims?: Parameters<typeof signIdToken>[0]
  key?: Parameters<typeof signIdToken>[1]
  origin?: string
  now?: Date
}

/** Signs in through the real redirect and callback, with Google answering with an ID token for `claims` */
async function completeSignIn({
  claims = idTokenClaims(NOW),
  key,
  origin = LOCAL_ORIGIN,
  now = NOW,
}: SignInOptions = {}) {
  googleRespondsWith(await signIdToken(claims, key), tokenRequests)
  const { state, pkceCookie, verifier } = await startSignIn(origin)
  const response = await handleCallback(
    signInCallbackRequest({ code: 'google-code', state }, [pkceCookie], origin),
    env,
    now,
  )
  return { response, verifier }
}

beforeEach(() => {
  tokenRequests = []
})

describe('Google sign-in callback', () => {
  it('exchanges the code with the stored verifier', async () => {
    await invite('listener@example.com')

    const { verifier } = await completeSignIn()

    expect(tokenRequests).toHaveLength(1)
    expect(tokenRequests[0]!.contentType).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(tokenRequests[0]!.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'google-code',
      redirect_uri: 'http://127.0.0.1:8787/auth/callback',
      client_id: 'test-google-client-id',
      client_secret: 'test-google-client-secret',
      code_verifier: verifier,
    })
  })

  it('creates a Listener on first sign-in and redirects to Explore', async () => {
    await invite('listener@example.com')

    const { response } = await completeSignIn()

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/explore')
    const rows = await getDb(env).select().from(listeners)
    expect(rows).toEqual([
      {
        id: expect.stringMatching(UUID),
        googleSub: 'google-sub-1',
        email: 'listener@example.com',
        createdAt: NOW,
      },
    ])
  })

  it('finds the same Listener on later sign-ins and keeps their email current', async () => {
    await invite('listener@example.com')
    await invite('renamed@example.com')
    await completeSignIn()
    const [first] = await getDb(env).select().from(listeners)

    network.resetHandlers()
    await completeSignIn({
      claims: idTokenClaims(LATER, { email: 'renamed@example.com' }),
      now: LATER,
    })

    const rows = await getDb(env).select().from(listeners)
    expect(rows).toEqual([{ ...first, email: 'renamed@example.com' }])
  })

  it('creates separate Listeners for different Google accounts', async () => {
    await invite('alice@example.com')
    await invite('bob@example.com')

    await completeSignIn({
      claims: idTokenClaims(NOW, { sub: 'alice-sub', email: 'alice@example.com' }),
    })
    network.resetHandlers()
    await completeSignIn({
      claims: idTokenClaims(NOW, { sub: 'bob-sub', email: 'bob@example.com' }),
    })

    const rows = await getDb(env).select().from(listeners)
    expect(rows.map(({ googleSub, email }) => ({ googleSub, email }))).toEqual(
      expect.arrayContaining([
        { googleSub: 'alice-sub', email: 'alice@example.com' },
        { googleSub: 'bob-sub', email: 'bob@example.com' },
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  it('starts a 30-day session and clears the PKCE cookie', async () => {
    await invite('listener@example.com')

    const { response } = await completeSignIn()

    const cookies = responseCookies(response)
    const session = cookies.get('loom_session')
    expect(session?.value ?? '').toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(session?.attributes ?? []).toEqual(
      expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']),
    )
    expect(session?.attributes ?? []).not.toContain('Secure')
    expect(cookies.get('loom_pkce')).toEqual({
      value: '',
      attributes: expect.arrayContaining(['Max-Age=0', 'Path=/auth']),
    })

    const [listener] = await getDb(env).select().from(listeners)
    expect(await getDb(env).select().from(sessions)).toEqual([
      {
        idHash: await sha256Hex(session!.value),
        listenerId: listener!.id,
        expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
        createdAt: NOW,
      },
    ])
  })

  it('marks the session cookie Secure over https', async () => {
    await invite('listener@example.com')

    const { response } = await completeSignIn({ origin: DEPLOYED_ORIGIN })

    expect(responseCookies(response).get('loom_session')?.attributes ?? []).toContain('Secure')
  })

  it.each([
    ['Invite has capitals', 'Listener@Example.COM', 'listener@example.com'],
    ['Google email has capitals', 'listener@example.com', 'Listener@Example.com'],
  ])('matches Invites ignoring case (%s)', async (_case, invited, googleEmail) => {
    await invite(invited)

    const { response } = await completeSignIn({
      claims: idTokenClaims(NOW, { email: googleEmail }),
    })

    expect(response.headers.get('Location')).toBe('/explore')
    expect(await getDb(env).select().from(listeners)).toHaveLength(1)
  })

  it('accepts both issuers Google uses', async () => {
    await invite('listener@example.com')

    const { response } = await completeSignIn({
      claims: idTokenClaims(NOW, { iss: 'accounts.google.com' }),
    })

    expect(response.headers.get('Location')).toBe('/explore')
  })

  describe('refused sign-ins create no Listener or session', () => {
    async function expectRefused(response: Response, location: string) {
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(location)
      expect(await getDb(env).select().from(listeners)).toHaveLength(0)
      expect(await getDb(env).select().from(sessions)).toHaveLength(0)
      expect(responseCookies(response).has('loom_session')).toBe(false)
    }

    it('rejects a state mismatch as an expired link', async () => {
      await invite('listener@example.com')
      googleRespondsWith(await signIdToken(idTokenClaims(NOW)), tokenRequests)
      const { pkceCookie } = await startSignIn()

      const response = await handleCallback(
        signInCallbackRequest({ code: 'google-code', state: 'forged-state' }, [pkceCookie]),
        env,
        NOW,
      )

      await expectRefused(response, '/?signin=expired')
      expect(tokenRequests).toHaveLength(0)
    })

    it('treats a reloaded callback without the PKCE cookie as expired', async () => {
      await invite('listener@example.com')
      googleRespondsWith(await signIdToken(idTokenClaims(NOW)), tokenRequests)
      const { state } = await startSignIn()

      const response = await handleCallback(
        signInCallbackRequest({ code: 'google-code', state }),
        env,
        NOW,
      )

      await expectRefused(response, '/?signin=expired')
      expect(tokenRequests).toHaveLength(0)
    })

    it('treats a code Google rejects as expired', async () => {
      await invite('listener@example.com')
      googleRespondsWith('', tokenRequests, () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
      )
      const { state, pkceCookie } = await startSignIn()

      const response = await handleCallback(
        signInCallbackRequest({ code: 'used-code', state }, [pkceCookie]),
        env,
        NOW,
      )

      await expectRefused(response, '/?signin=expired')
    })

    it('reports a cancelled Google sign-in', async () => {
      await invite('listener@example.com')
      googleRespondsWith(await signIdToken(idTokenClaims(NOW)), tokenRequests)
      const { state, pkceCookie } = await startSignIn()

      const response = await handleCallback(
        signInCallbackRequest({ error: 'access_denied', state }, [pkceCookie]),
        env,
        NOW,
      )

      await expectRefused(response, '/?signin=denied')
      expect(tokenRequests).toHaveLength(0)
    })

    it('refuses an email that has no Invite', async () => {
      await invite('someone-else@example.com')

      const { response } = await completeSignIn()

      await expectRefused(response, '/?signin=not-invited')
    })

    it('refuses an Invited email Google has not verified', async () => {
      await invite('listener@example.com')

      const { response } = await completeSignIn({
        claims: idTokenClaims(NOW, { email_verified: false }),
      })

      await expectRefused(response, '/?signin=not-invited')
    })

    it('refuses a returning Listener whose Invite was removed', async () => {
      await invite('listener@example.com')
      await completeSignIn()
      await getDb(env).delete(sessions)
      await getDb(env).delete(invites).where(eq(invites.email, 'listener@example.com'))

      network.resetHandlers()
      const { response } = await completeSignIn({ claims: idTokenClaims(LATER), now: LATER })

      expect(response.headers.get('Location')).toBe('/?signin=not-invited')
      expect(responseCookies(response).has('loom_session')).toBe(false)
      expect(await getDb(env).select().from(sessions)).toHaveLength(0)
    })

    it('refuses an ID token signed with a key Google never published', async () => {
      await invite('listener@example.com')

      const { response } = await completeSignIn({ key: forgedKey.privateKey })

      await expectRefused(response, '/?signin=failed')
    })

    it('refuses an ID token issued to another app', async () => {
      await invite('listener@example.com')

      const { response } = await completeSignIn({
        claims: idTokenClaims(NOW, { aud: 'someone-elses-client-id' }),
      })

      await expectRefused(response, '/?signin=failed')
    })

    it('refuses an ID token from another issuer', async () => {
      await invite('listener@example.com')

      const { response } = await completeSignIn({
        claims: idTokenClaims(NOW, { iss: 'https://accounts.example.com' }),
      })

      await expectRefused(response, '/?signin=failed')
    })

    it('refuses an expired ID token', async () => {
      await invite('listener@example.com')
      const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000)

      const { response } = await completeSignIn({ claims: idTokenClaims(twoHoursAgo) })

      await expectRefused(response, '/?signin=failed')
    })

    it('reports a Google outage as a failed sign-in', async () => {
      await invite('listener@example.com')
      googleRespondsWith('', tokenRequests, () => new HttpResponse(null, { status: 503 }))
      const { state, pkceCookie } = await startSignIn()

      const response = await handleCallback(
        signInCallbackRequest({ code: 'google-code', state }, [pkceCookie]),
        env,
        NOW,
      )

      await expectRefused(response, '/?signin=failed')
    })
  })
})
