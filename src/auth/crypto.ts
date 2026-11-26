import { base64url } from "./pkce";

const IV_BYTES = 12;

async function importKey(keyBase64: string) {
  const raw = Uint8Array.from(atob(keyBase64), char => char.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function fromBase64url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/** Stored as base64url(iv + ciphertext) so each token gets its own random IV */
export async function encryptToken(
  plain: string,
  keyBase64: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(keyBase64),
    new TextEncoder().encode(plain),
  );
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_BYTES);
  return base64url(combined);
}

export async function decryptToken(
  encrypted: string,
  keyBase64: string,
): Promise<string> {
  const combined = fromBase64url(encrypted);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, IV_BYTES) },
    await importKey(keyBase64),
    combined.slice(IV_BYTES),
  );
  return new TextDecoder().decode(plain);
}
