import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
// Google signs ID tokens with either issuer
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

/** The Google account behind an ID token, or null if Google didn't issue it to Loom */
export async function verifyGoogleIdToken(
  idToken: string,
  env: Env,
  now: Date,
): Promise<GoogleIdentity | null> {
  const certsResponse = await fetch(GOOGLE_CERTS_URL);
  if (!certsResponse.ok) return null;
  const keys = createLocalJWKSet(await certsResponse.json<JSONWebKeySet>());

  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
      currentDate: now,
    });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return null;
  }
}
