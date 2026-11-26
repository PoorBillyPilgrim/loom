import { env } from 'cloudflare:workers'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { decryptToken } from '@/auth/crypto'
import { handleCallback } from '@/auth/callback'
import { getDb } from '@/db/client'
import { listeners, sessions } from '@/db/schema'
import me from '../fixtures/spotify/me.json'
import token from '../fixtures/spotify/token.json'
import {
  DEPLOYED_ORIGIN,
  callbackRequest,
  responseCookies,
  sha256Hex,
  startLogin,
} from '../helpers/auth'
import { network } from '../network'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const ME_URL = 'https://api.spotify.com/v1/me'
const NOW = new Date('2026-11-25T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

let tokenRequests: { authorization: string | null; body: URLSearchParams }[]

function spotifyRespondsWith(tokenBody: object = token, meResponse = () => HttpResponse.json(me)) {
  network.use(
    http.post(TOKEN_URL, async ({ request }) => {
      tokenRequests.push({
        authorization: request.headers.get('Authorization'),
        body: new URLSearchParams(await request.text()),
      })
      return HttpResponse.json(tokenBody)
    }),
    http.get(ME_URL, meResponse),
  )
}

async function completeLogin(origin?: string) {
  const { state, pkceCookie, verifier } = await startLogin(origin)
  const response = await handleCallback(
    callbackRequest({ code: 'spotify-code', state }, pkceCookie, origin),
    env,
    NOW,
  )
  return { response, verifier }
}

beforeEach(() => {
  tokenRequests = []
})

describe('Spotify login callback', () => {
  it('exchanges the code with the stored verifier', async () => {
    spotifyRespondsWith()

    const { verifier } = await completeLogin()

    expect(tokenRequests).toHaveLength(1)
    const [request] = tokenRequests
    expect(request!.authorization).toBe(`Basic ${btoa('test-client-id:test-client-secret')}`)
    expect(Object.fromEntries(request!.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'spotify-code',
      redirect_uri: 'http://127.0.0.1:8787/auth/callback',
      code_verifier: verifier,
    })
  })

  it('creates a Listener keyed by account_id and redirects to Explore', async () => {
    spotifyRespondsWith()

    const { response } = await completeLogin()

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/explore')
    const rows = await getDb(env).select().from(listeners)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.spotifyAccountId).toBe('fixture-account-id')
  })

  it('starts a 30-day session and clears the PKCE cookie', async () => {
    spotifyRespondsWith()

    const { response } = await completeLogin()

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
    const rows = await getDb(env).select().from(sessions)
    expect(rows).toEqual([
      {
        idHash: await sha256Hex(session!.value),
        listenerId: listener!.id,
        expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
        createdAt: NOW,
      },
    ])
  })

  it('marks the session cookie Secure over https', async () => {
    spotifyRespondsWith()

    const { response } = await completeLogin(DEPLOYED_ORIGIN)

    expect(responseCookies(response).get('loom_session')?.attributes ?? []).toContain('Secure')
  })

  it('stores Spotify tokens encrypted', async () => {
    spotifyRespondsWith()

    await completeLogin()

    const rows = await getDb(env).select().from(listeners)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row!.accessTokenEnc).not.toContain('fixture-access-token')
    expect(row!.refreshTokenEnc).not.toContain('fixture-refresh-token')
    expect(await decryptToken(row!.accessTokenEnc!, env.TOKEN_ENCRYPTION_KEY)).toBe(
      'fixture-access-token',
    )
    expect(await decryptToken(row!.refreshTokenEnc!, env.TOKEN_ENCRYPTION_KEY)).toBe(
      'fixture-refresh-token',
    )
    expect(row!.accessTokenExpiresAt).toEqual(new Date(NOW.getTime() + 3600 * 1000))
    expect(row!.refreshTokenIssuedAt).toEqual(NOW)
  })

  it('reuses a returning Listener and updates their tokens', async () => {
    spotifyRespondsWith()
    await completeLogin()
    const [first] = await getDb(env).select().from(listeners)

    network.resetHandlers()
    spotifyRespondsWith({ ...token, access_token: 'second-access-token' })
    await completeLogin()

    const rows = await getDb(env).select().from(listeners)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(first!.id)
    expect(await decryptToken(rows[0]!.accessTokenEnc!, env.TOKEN_ENCRYPTION_KEY)).toBe(
      'second-access-token',
    )
  })

  describe('failed logins create no Listener', () => {
    async function expectRedirectWithoutListener(response: Response, location: string) {
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(location)
      expect(await getDb(env).select().from(listeners)).toHaveLength(0)
      expect(responseCookies(response).has('loom_session')).toBe(false)
    }

    it('rejects a state mismatch as an expired login', async () => {
      spotifyRespondsWith()
      const { pkceCookie } = await startLogin()

      const response = await handleCallback(
        callbackRequest({ code: 'spotify-code', state: 'forged-state' }, pkceCookie),
        env,
        NOW,
      )

      await expectRedirectWithoutListener(response, '/?login=expired')
      expect(tokenRequests).toHaveLength(0)
    })

    it('treats a reloaded callback without the PKCE cookie as expired', async () => {
      spotifyRespondsWith()
      const { state } = await startLogin()

      const response = await handleCallback(
        callbackRequest({ code: 'spotify-code', state }),
        env,
        NOW,
      )

      await expectRedirectWithoutListener(response, '/?login=expired')
      expect(tokenRequests).toHaveLength(0)
    })

    it('treats a code Spotify rejects as expired', async () => {
      network.use(
        http.post(TOKEN_URL, () => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })),
      )
      const { state, pkceCookie } = await startLogin()

      const response = await handleCallback(
        callbackRequest({ code: 'used-code', state }, pkceCookie),
        env,
        NOW,
      )

      await expectRedirectWithoutListener(response, '/?login=expired')
    })

    it('sends a Listener missing from the Spotify allowlist to the invite message', async () => {
      spotifyRespondsWith(token, () =>
        HttpResponse.text('User not registered in the Developer Dashboard', { status: 403 }),
      )

      const { response } = await completeLogin()

      await expectRedirectWithoutListener(response, '/?login=not-invited')
    })

    it('reports a cancelled Spotify login', async () => {
      spotifyRespondsWith()
      const { state, pkceCookie } = await startLogin()

      const response = await handleCallback(
        callbackRequest({ error: 'access_denied', state }, pkceCookie),
        env,
        NOW,
      )

      await expectRedirectWithoutListener(response, '/?login=denied')
      expect(tokenRequests).toHaveLength(0)
    })

    it('reports a Spotify outage as a failed login', async () => {
      spotifyRespondsWith(token, () => new HttpResponse(null, { status: 503 }))

      const { response } = await completeLogin()

      await expectRedirectWithoutListener(response, '/?login=failed')
    })
  })
})
