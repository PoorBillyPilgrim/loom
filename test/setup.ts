import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { network } from './network'

beforeAll(() => network.enable())
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
afterEach(() => network.resetHandlers())
afterAll(() => network.disable())
