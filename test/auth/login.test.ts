import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { handleLogin } from '@/auth/login'

const LOCAL_LOGIN = 'http://127.0.0.1:8787/auth/login'
const DEPLOYED_LOGIN = 'https://loom.example.workers.dev/auth/login'

async function login(url = LOCAL_LOGIN) {
  const response = await handleLogin(new Request(url), env)
  const location = new URL(response.headers.get('Location') ?? 'http://missing.invalid')
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

describe('Log in with Spotify', () => {
  it('redirects to Spotify authorize with PKCE', async () => {
    const { response, location } = await login()

    expect(response.status).toBe(302)
    expect(location.origin).toBe('https://accounts.spotify.com')
    expect(location.pathname).toBe('/authorize')
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: 'test-client-id',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:8787/auth/callback',
      code_challenge_method: 'S256',
      scope: 'user-top-read user-follow-read user-follow-modify user-library-read user-library-modify',
    })
    expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('stores verifier and state in a short-lived HttpOnly cookie', async () => {
    const { location, cookieName, cookieState, cookieVerifier, attributes } = await login()

    expect(cookieName).toBe('loom_pkce')
    expect(attributes).toEqual(
      expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Max-Age=600', 'Path=/auth']),
    )
    expect(cookieState).toBe(location.searchParams.get('state'))
    // RFC 7636: verifier is 43-128 unreserved characters
    expect(cookieVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
    expect(await s256(cookieVerifier!)).toBe(location.searchParams.get('code_challenge'))
  })

  it('generates a new state and verifier per request', async () => {
    const first = await login()
    const second = await login()

    expect(second.cookieState).not.toBe(first.cookieState)
    expect(second.cookieVerifier).not.toBe(first.cookieVerifier)
  })

  it('marks the cookie Secure only over https', async () => {
    const local = await login(LOCAL_LOGIN)
    const deployed = await login(DEPLOYED_LOGIN)

    expect(local.setCookie).not.toBe('')
    expect(local.attributes).not.toContain('Secure')
    expect(deployed.attributes).toContain('Secure')
  })
})
