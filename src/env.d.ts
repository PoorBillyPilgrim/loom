// Secrets live in .dev.vars locally and Worker secrets in production, so `wrangler types` can't see them
interface __BaseEnv_Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  LASTFM_API_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
  // Local only, never a Worker secret. "true" turns on /dev/spotify for re-recording test fixtures.
  LOOM_RECORD_FIXTURES?: string;
}
