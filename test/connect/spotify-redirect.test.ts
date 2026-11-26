import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { handleConnectSpotify } from '@/connect/spotify-redirect'
import { DEPLOYED_ORIGIN, LOCAL_ORIGIN, responseCookies, signedInListener } from '../helpers/auth'

async function connect({ origin = LOCAL_ORIGIN, sessionCookie = '' } = {}) {
  const response = await handleConnectSpotify(
    new Request(`${origin}/connect/spotify`, {
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    }),
    env,
  )
  const location = new URL(response.headers.get('Location') ?? 'http://missing.invalid', origin)
  const setCookie = response.headers.get('Set-Cookie') ?? ''
  const [pair = '', ...attributes] = setCookie.split(';').map((part) => part.trim())
  const [cookieName, cookieValue = ''] = pair.split('=')
  const [cookieState, cookieVerifier] = cookieValue.split('.')
  return { response, location, setCookie, cookieName, cookieState, cookieVerifier, attributes }
}

async function s256(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

describe('Connect Spotify', () => {
  it('redirects to Spotify authorize with PKCE', async () => {
    const { sessionCookie } = await signedInListener()

    const { response, location } = await connect({ sessionCookie })

    expect(response.status).toBe(302)
    expect(location.origin).toBe('https://accounts.spotify.com')
    expect(location.pathname).toBe('/authorize')
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: 'test-client-id',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:8787/connect/spotify/callback',
      code_challenge_method: 'S256',
      scope: 'user-top-read user-follow-read user-follow-modify user-library-read user-library-modify',
    })
    expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('stores verifier and state in a short-lived HttpOnly cookie on the connect path', async () => {
    const { sessionCookie } = await signedInListener()

    const { location, cookieName, cookieState, cookieVerifier, attributes } = await connect({
      sessionCookie,
    })

    expect(cookieName).toBe('loom_pkce')
    expect(attributes).toEqual(
      expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Max-Age=600', 'Path=/connect/spotify']),
    )
    expect(cookieState).toBe(location.searchParams.get('state'))
    // RFC 7636: verifier is 43-128 unreserved characters
    expect(cookieVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
    expect(await s256(cookieVerifier!)).toBe(location.searchParams.get('code_challenge'))
  })

  it('generates a new state and verifier per request', async () => {
    const { sessionCookie } = await signedInListener()

    const first = await connect({ sessionCookie })
    const second = await connect({ sessionCookie })

    expect(second.cookieState).not.toBe(first.cookieState)
    expect(second.cookieVerifier).not.toBe(first.cookieVerifier)
  })

  it('marks the cookie Secure only over https', async () => {
    const { sessionCookie } = await signedInListener()

    const local = await connect({ origin: LOCAL_ORIGIN, sessionCookie })
    const deployed = await connect({ origin: DEPLOYED_ORIGIN, sessionCookie })

    expect(local.setCookie).not.toBe('')
    expect(local.attributes).not.toContain('Secure')
    expect(deployed.attributes).toContain('Secure')
  })

  it('sends a request without a session to sign in', async () => {
    const { response } = await connect()

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/auth/login')
    expect(responseCookies(response).has('loom_pkce')).toBe(false)
  })

  it('sends a request with an unknown session to sign in', async () => {
    await signedInListener()

    const { response } = await connect({ sessionCookie: 'loom_session=not-a-real-session' })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/auth/login')
  })
})
