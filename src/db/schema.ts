import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const listeners = sqliteTable('listeners', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const invites = sqliteTable('invites', {
  email: text('email').primaryKey(),
})

export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    listenerId: text('listener_id')
      .notNull()
      .references(() => listeners.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['spotify'] }).notNull(),
    externalAccountId: text('external_account_id').notNull(),
    // Null once Spotify's 6-month authorization runs out; the Listener must reconnect
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenIssuedAt: integer('refresh_token_issued_at', { mode: 'timestamp_ms' }),
    linkedAt: integer('linked_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique('connections_listener_kind_unique').on(table.listenerId, table.kind),
    unique('connections_kind_account_unique').on(table.kind, table.externalAccountId),
  ],
)

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  listenerId: text('listener_id')
    .notNull()
    .references(() => listeners.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
