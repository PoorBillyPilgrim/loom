export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

type CookieOptions = { path: string; maxAge: number; httpOnly?: boolean };

export function serializeCookie(
  request: Request,
  name: string,
  value: string,
  { path, maxAge, httpOnly = true }: CookieOptions,
): string {
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (httpOnly) parts.push("HttpOnly");
  // Browsers drop Secure cookies on http://127.0.0.1 in some cases, so only set it once deployed
  if (new URL(request.url).protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
