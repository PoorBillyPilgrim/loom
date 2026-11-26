import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      cloudflareTest({
        main: './test/worker.ts',
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            SPOTIFY_CLIENT_ID: 'test-client-id',
            SPOTIFY_CLIENT_SECRET: 'test-client-secret',
            SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8787/auth/callback',
            LASTFM_API_KEY: 'test-lastfm-key',
            TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  }
})
