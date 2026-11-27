# Spotify API

How Spotify's APIs behave where Loom depends on it.

## Error responses

The Web API (`https://api.spotify.com/v1/…`) returns errors with this body:

```json
{
  "error": {
    "status": 401,
    "message": "…"
  }
}
```

`status` is 401, 403 or 429, and matches the HTTP status.

The Accounts token endpoint (`https://accounts.spotify.com/api/token`) uses a different, flat OAuth shape instead, e.g. `{ "error": "invalid_grant", "error_description": "…" }`. See `src/spotify/access-token.ts`.

## Development Mode

A Development Mode app answers 403 to any Listener who isn't on its dashboard allowlist, which has room for five. Connect Spotify shows this as "Spotify access is limited to five Listeners".

## `/v1/me`

Identify a Spotify Connection by `account_id`, not `id`. Spotify recommends it for account linking because it never changes for the life of the account.
