import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTPayload,
} from "jose";
import { http, HttpResponse } from "msw";
import { network } from "../network";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_KID = "google-test-key";

/** Stands in for Google's signing key, published at the certs URL */
export const googleKey = await generateKeyPair("RS256", { extractable: true });
/** A key Google never published, for forged ID tokens */
export const forgedKey = await generateKeyPair("RS256", { extractable: true });

const googleJwks = {
  keys: [
    {
      ...(await exportJWK(googleKey.publicKey)),
      kid: GOOGLE_KID,
      alg: "RS256",
      use: "sig",
    },
  ],
};

export function idTokenClaims(
  now: Date,
  overrides: JWTPayload = {},
): JWTPayload {
  const iat = Math.floor(now.getTime() / 1000);
  return {
    iss: "https://accounts.google.com",
    aud: "test-google-client-id",
    sub: "google-sub-1",
    email: "listener@example.com",
    email_verified: true,
    name: "Fixture Listener",
    iat,
    exp: iat + 3600,
    ...overrides,
  };
}

export async function signIdToken(
  claims: JWTPayload,
  key: CryptoKey = googleKey.privateKey,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: GOOGLE_KID })
    .sign(key);
}

export type GoogleTokenRequest = {
  contentType: string | null;
  body: URLSearchParams;
};

/** Serves Google's token endpoint and published keys, recording each token request */
export function googleRespondsWith(
  idToken: string,
  tokenRequests: GoogleTokenRequest[] = [],
  tokenResponse?: () => Response,
) {
  network.use(
    http.post(GOOGLE_TOKEN_URL, async ({ request }) => {
      tokenRequests.push({
        contentType: request.headers.get("Content-Type"),
        body: new URLSearchParams(await request.text()),
      });
      if (tokenResponse) return tokenResponse();
      return HttpResponse.json({
        access_token: "google-access-token",
        expires_in: 3599,
        id_token: idToken,
        scope:
          "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        token_type: "Bearer",
      });
    }),
    http.get(GOOGLE_CERTS_URL, () => HttpResponse.json(googleJwks)),
  );
  return tokenRequests;
}
