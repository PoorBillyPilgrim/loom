import { getDb } from '@/db/client'
import { listeners } from '@/db/schema'
import { readCookie, redirect, serializeCookie } from './cookies'
import { encryptToken } from './crypto'
import { PKCE_COOKIE, PKCE_COOKIE_PATH } from './login'
import { createSession, sessionCookie } from './session'

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_ME_URL = 'https://api.spotify.com/v1/me'

type LoginOutcome = 'expired' | 'not-invited' | 'denied' | 'failed'
type SpotifyTokens = { access_token: string; refresh_token: string; expires_in: number }

export async function handleCallback(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url)
  const clearPkce = serializeCookie(request, PKCE_COOKIE, '', { path: PKCE_COOKIE_PATH, maxAge: 0 })
  const fail = (outcome: LoginOutcome) => redirect(`/?login=${outcome}`, [clearPkce])

  if (url.searchParams.get('error')) return fail('denied')

  const [state, verifier] = (readCookie(request, PKCE_COOKIE) ?? '').split('.')
  const code = url.searchParams.get('code')
  if (!state || !verifier || !code || url.searchParams.get('state') !== state) {
    return fail('expired')
  }

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  // Spotify answers 400 when the code was already used or has expired
  if (tokenResponse.status === 400) return fail('expired')
  if (!tokenResponse.ok) return fail('failed')
  const tokens = (await tokenResponse.json()) as SpotifyTokens

  const meResponse = await fetch(SPOTIFY_ME_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  // Development Mode apps answer 403 for anyone not on the dashboard allowlist
  if (meResponse.status === 403) return fail('not-invited')
  if (!meResponse.ok) return fail('failed')
  const { account_id: spotifyAccountId } = (await meResponse.json()) as { account_id: string }

  const tokenColumns = {
    accessTokenEnc: await encryptToken(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    refreshTokenEnc: await encryptToken(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    // Each login is a fresh authorization, which restarts Spotify's 6-month refresh token clock
    refreshTokenIssuedAt: now,
  }
  const db = getDb(env)
  const [listener] = await db
    .insert(listeners)
    .values({ id: crypto.randomUUID(), spotifyAccountId, createdAt: now, ...tokenColumns })
    .onConflictDoUpdate({ target: listeners.spotifyAccountId, set: tokenColumns })
    .returning({ id: listeners.id })

  const session = await createSession(db, listener!.id, now)
  return redirect('/explore', [sessionCookie(request, session), clearPkce])
}
