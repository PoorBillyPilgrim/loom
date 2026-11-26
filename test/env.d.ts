interface __BaseEnv_Env {
  // A top-level import would make this file a module, and Env would stop merging
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
}
