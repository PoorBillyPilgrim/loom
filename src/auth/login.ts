import { createPkce, randomToken } from './pkce'

export const PKCE_COOKIE = 'loom_pkce'

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const SCOPES = [
  'user-top-read',
  'user-follow-read',
  'user-follow-modify',
  'user-library-read',
  'user-library-modify',
]

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = randomToken(32)
  const { verifier, challenge } = await createPkce()

  const authorize = new URL(SPOTIFY_AUTHORIZE_URL)
  authorize.search = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  }).toString()

  const cookie = [
    `${PKCE_COOKIE}=${state}.${verifier}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600',
    'Path=/auth',
  ]
  // Browsers drop Secure cookies on http://127.0.0.1 in some cases, so only set it once deployed
  if (new URL(request.url).protocol === 'https:') cookie.push('Secure')

  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString(), 'Set-Cookie': cookie.join('; ') },
  })
}
