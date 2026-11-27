import { readCookie, redirect, serializeCookie } from "@/auth/cookies";
import { createPkce, randomToken } from "@/auth/pkce";

export const PKCE_COOKIE = "loom_pkce";

export type AuthorizationServer = {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  cookiePath: string;
};

export async function authorizeRedirect(
  request: Request,
  server: AuthorizationServer,
): Promise<Response> {
  const state = randomToken(32);
  const { verifier, challenge } = await createPkce();

  const authorize = new URL(server.authorizeUrl);
  authorize.search = new URLSearchParams({
    client_id: server.clientId,
    response_type: "code",
    redirect_uri: server.redirectUri,
    scope: server.scopes.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();

  return redirect(authorize.toString(), [
    serializeCookie(request, PKCE_COOKIE, `${state}.${verifier}`, {
      path: server.cookiePath,
      maxAge: 600,
    }),
  ]);
}

/** Undefined when the sign-in or connect link has expired or was tampered with */
export function readAuthorizationCode(
  request: Request,
): { code: string; verifier: string } | undefined {
  const url = new URL(request.url);
  const [state, verifier] = (readCookie(request, PKCE_COOKIE) ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!state || !verifier || !code || url.searchParams.get("state") !== state) {
    return undefined;
  }
  return { code, verifier };
}

export function clearPkceCookie(request: Request, cookiePath: string): string {
  return serializeCookie(request, PKCE_COOKIE, "", {
    path: cookiePath,
    maxAge: 0,
  });
}
