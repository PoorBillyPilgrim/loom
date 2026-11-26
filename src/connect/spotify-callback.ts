import { readCookie, redirect, serializeCookie } from '@/auth/cookies'
import { encryptToken } from '@/auth/crypto'
import { currentListener } from '@/auth/session'
import { getDb } from '@/db/client'
import { connections } from '@/db/schema'
import { PKCE_COOKIE, PKCE_COOKIE_PATH } from './spotify-redirect'

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_ME_URL = 'https://api.spotify.com/v1/me'

type ConnectOutcome = 'expired' | 'limited' | 'denied' | 'failed'
type SpotifyTokens = { access_token: string; refresh_token: string; expires_in: number }

export async function handleSpotifyCallback(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url)
  const clearPkce = serializeCookie(request, PKCE_COOKIE, '', { path: PKCE_COOKIE_PATH, maxAge: 0 })
  const fail = (outcome: ConnectOutcome) => redirect(`/explore?spotify=${outcome}`, [clearPkce])

  const db = getDb(env)
  const listener = await currentListener(request, db, now)
  if (!listener) return redirect('/auth/login', [clearPkce])

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
  if (meResponse.status === 403) return fail('limited')
  if (!meResponse.ok) return fail('failed')
  const { account_id: externalAccountId } = (await meResponse.json()) as { account_id: string }

  const connectionColumns = {
    externalAccountId,
    accessTokenEnc: await encryptToken(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    refreshTokenEnc: await encryptToken(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY),
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    // Each authorization restarts Spotify's 6-month refresh token clock
    refreshTokenIssuedAt: now,
  }
  await db
    .insert(connections)
    .values({
      id: crypto.randomUUID(),
      listenerId: listener.id,
      kind: 'spotify',
      linkedAt: now,
      ...connectionColumns,
    })
    .onConflictDoUpdate({
      target: [connections.listenerId, connections.kind],
      set: connectionColumns,
    })

  return redirect('/explore', [clearPkce])
}
