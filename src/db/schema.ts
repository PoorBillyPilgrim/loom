import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const listeners = sqliteTable('listeners', {
  id: text('id').primaryKey(),
  spotifyAccountId: text('spotify_account_id').notNull().unique(),
  // Null once Spotify's 6-month authorization runs out; the Listener must log in again
  accessTokenEnc: text('access_token_enc'),
  refreshTokenEnc: text('refresh_token_enc'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenIssuedAt: integer('refresh_token_issued_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  listenerId: text('listener_id')
    .notNull()
    .references(() => listeners.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
