import { getDb } from "@/db/client";
import { listeners } from "@/db/schema";
import { clearPkceCookie, readAuthorizationCode } from "./authorize";
import { redirect } from "./cookies";
import { verifyGoogleIdToken } from "./google-id-token";
import { isInvited } from "./invites";
import { PKCE_COOKIE_PATH } from "./google-redirect";
import { createSession, sessionCookie } from "./session";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type SignInOutcome = "expired" | "not-invited" | "denied" | "failed";

export async function handleGoogleCallback(
  request: Request,
  env: Env,
  now: Date = new Date(),
): Promise<Response> {
  const clearPkce = clearPkceCookie(request, PKCE_COOKIE_PATH);
  const fail = (outcome: SignInOutcome) =>
    redirect(`/?signin=${outcome}`, [clearPkce]);

  if (new URL(request.url).searchParams.get("error")) return fail("denied");

  const authorization = readAuthorizationCode(request);
  if (!authorization) return fail("expired");
  const { code, verifier } = authorization;

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code_verifier: verifier,
    }),
  });
  // Google answers 400 when the code was already used or has expired
  if (tokenResponse.status === 400) return fail("expired");
  if (!tokenResponse.ok) return fail("failed");
  const { id_token: idToken } = await tokenResponse.json<{
    id_token: string;
  }>();

  const identity = await verifyGoogleIdToken(idToken, env, now);
  if (!identity) return fail("failed");

  const db = getDb(env);
  // Checked on every sign-in, so removing an Invite locks the Listener out
  if (!identity.emailVerified || !(await isInvited(db, identity.email))) {
    return fail("not-invited");
  }

  const [listener] = await db
    .insert(listeners)
    .values({
      id: crypto.randomUUID(),
      googleSub: identity.sub,
      email: identity.email,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: listeners.googleSub,
      set: { email: identity.email },
    })
    .returning({ id: listeners.id });

  const session = await createSession(db, listener.id, now);
  return redirect("/explore", [sessionCookie(request, session), clearPkce]);
}
