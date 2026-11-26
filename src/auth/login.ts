import { redirect, serializeCookie } from './cookies'
import { createPkce, randomToken } from './pkce'

export const PKCE_COOKIE = 'loom_pkce'
export const PKCE_COOKIE_PATH = '/auth'

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
// Non-sensitive scopes, so Google needs no app verification
const SCOPES = ['openid', 'email', 'profile']

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = randomToken(32)
  const { verifier, challenge } = await createPkce()

  const authorize = new URL(GOOGLE_AUTHORIZE_URL)
  authorize.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  }).toString()

  return redirect(authorize.toString(), [
    serializeCookie(request, PKCE_COOKIE, `${state}.${verifier}`, {
      path: PKCE_COOKIE_PATH,
      maxAge: 600,
    }),
  ])
}
