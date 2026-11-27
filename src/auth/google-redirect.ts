import { authorizeRedirect } from "@/auth/authorize";

export const PKCE_COOKIE_PATH = "/auth";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// Non-sensitive scopes, so Google needs no app verification
const SCOPES = ["openid", "email", "profile"];

export function handleGoogleSignIn(
  request: Request,
  env: Env,
): Promise<Response> {
  return authorizeRedirect(request, {
    authorizeUrl: GOOGLE_AUTHORIZE_URL,
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    scopes: SCOPES,
    cookiePath: PKCE_COOKIE_PATH,
  });
}
