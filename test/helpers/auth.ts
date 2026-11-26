import { env } from 'cloudflare:workers'
import { handleLogin } from '@/auth/login'

export const LOCAL_ORIGIN = 'http://127.0.0.1:8787'
export const DEPLOYED_ORIGIN = 'https://loom.example.workers.dev'

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Every Set-Cookie on a response, keyed by cookie name */
export function responseCookies(response: Response) {
  const cookies = new Map<string, { value: string; attributes: string[] }>()
  for (const header of response.headers.getSetCookie()) {
    const [pair = '', ...attributes] = header.split(';').map((part) => part.trim())
    const separator = pair.indexOf('=')
    cookies.set(pair.slice(0, separator), { value: pair.slice(separator + 1), attributes })
  }
  return cookies
}

/** Runs the real login redirect, so the callback sees the same cookie and state Spotify would send back */
export async function startLogin(origin = LOCAL_ORIGIN) {
  const response = await handleLogin(new Request(`${origin}/auth/login`), env)
  const state = new URL(response.headers.get('Location')!).searchParams.get('state')!
  const pkce = responseCookies(response).get('loom_pkce')!.value
  const verifier = pkce.split('.')[1]!
  return { state, pkceCookie: `loom_pkce=${pkce}`, verifier }
}

export function callbackRequest(
  params: Record<string, string>,
  cookie?: string,
  origin = LOCAL_ORIGIN,
) {
  const url = new URL(`${origin}/auth/callback`)
  url.search = new URLSearchParams(params).toString()
  return new Request(url, { headers: cookie ? { Cookie: cookie } : {} })
}
