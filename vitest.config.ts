import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations"),
  );

  return {
    resolve: {
      tsconfigPaths: true,
      // Only TanStack Start's Vite plugin can load the real module, and tests don't run it
      alias: {
        "@tanstack/react-start/server": path.join(
          import.meta.dirname,
          "test/stubs/react-start-server.ts",
        ),
      },
    },
    plugins: [
      cloudflareTest({
        main: "./test/worker.ts",
        // Tests reset and migrate D1, so they must never reach the real database,
        // even if a binding in wrangler.jsonc is marked remote
        remoteBindings: false,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            GOOGLE_CLIENT_ID: "test-google-client-id",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            GOOGLE_REDIRECT_URI: "http://127.0.0.1:8787/auth/callback",
            SPOTIFY_CLIENT_ID: "test-client-id",
            SPOTIFY_CLIENT_SECRET: "test-client-secret",
            SPOTIFY_REDIRECT_URI:
              "http://127.0.0.1:8787/connect/spotify/callback",
            LASTFM_API_KEY: "test-lastfm-key",
            TOKEN_ENCRYPTION_KEY:
              "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
