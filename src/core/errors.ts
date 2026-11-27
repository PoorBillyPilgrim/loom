export type LoomErrorCode =
  | "not_signed_in"
  | "spotify_not_connected"
  | "spotify_needs_reconnect"
  | "spotify_quota_exceeded"
  | "spotify_rate_limited"
  | "spotify_unavailable";

/** An error the Listener should see a plain message for */
export class LoomError extends Error {
  readonly code: LoomErrorCode;

  constructor(code: LoomErrorCode) {
    super(code);
    this.name = "LoomError";
    this.code = code;
  }
}

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: LoomErrorCode };

export async function toResult<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof LoomError) return { ok: false, error: error.code };
    throw error;
  }
}
