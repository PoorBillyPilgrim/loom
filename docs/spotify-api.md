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

A 429 from Spotify's dev-mode quota also carries a `reason`. Retrying doesn't help, so Loom shows it as a quota error and doesn't wait:

```json
{
  "error": {
    "status": 429,
    "message": "Too many requests",
    "reason": "QUOTA_EXCEEDED"
  }
}
```

Any other 429 is a short-term rate limit. Loom waits out a `Retry-After` of 3 seconds or less and retries once.

The Accounts token endpoint (`https://accounts.spotify.com/api/token`) uses a different, flat OAuth shape instead, e.g. `{ "error": "invalid_grant", "error_description": "…" }`. See `src/spotify/access-token.ts`.

## Development Mode

A Development Mode app answers 403 to any Listener who isn't on its dashboard allowlist, which has room for five. Connect Spotify shows this as "Spotify access is limited to five Listeners".

## Artists

Since February 2026, artist objects from top artists and search have only `external_urls`, `href`, `id`, `images`, `name`, `type` and `uri`. There's no `followers`, `genres` or `popularity`.

`images` runs widest first. The smallest is usually 160 px, but some artists' smallest is 64 px, and some artists have no images at all.

## Library (for Keep, #7)

`GET /v1/me/library/contains?uris=<Spotify URIs>` takes full typed URIs and answers with an array of booleans in the same order, e.g. `?uris=spotify:album:35ePiX5vGMFyRY2x909JRV` → `[true]`.

Since February 2026, Development Mode apps save and follow through one endpoint. The per-type ones are gone, including `PUT /v1/me/following`, so Keep can't follow an Artist that way.

- `PUT /v1/me/library?uris=<Spotify URIs>` saves or follows. `DELETE` with the same query removes.
- URIs go in the query, comma-separated, up to 40. There's no JSON body.
- A success is a 200 with an empty body.

Unconfirmed: the reference doesn't list `artist` among the URI types `PUT /v1/me/library` accepts, but the [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)'s example saves a `spotify:artist:` URI. Try one live before building Keep on it.

### Scopes

Connect Spotify asks for `user-top-read`, `user-follow-read`, `user-follow-modify`, `user-library-read` and `user-library-modify` (`src/connect/spotify-redirect.ts`). Spotify grants all or none, so a Spotify Connection has all five. Loom doesn't store the granted scopes.

The library endpoints list several scopes without saying which applies to which type:

- `PUT` and `DELETE /v1/me/library`: `user-library-modify`, `user-follow-modify`, `playlist-modify-public`
- `GET /v1/me/library/contains`: `user-library-read`, `user-follow-read`, `playlist-read-private`

Loom already asks for both the library and follow scopes, so following an Artist is covered whichever one Spotify checks. No scopes were added, renamed or removed in February 2026.

## Recording fixtures

With `LOOM_RECORD_FIXTURES=true` in `.dev.vars`, signed in, open `http://127.0.0.1:8787/dev/spotify/<path>?<query>` to see Spotify's raw response for your account, e.g. `/dev/spotify/me/top/artists?time_range=short_term`. Save it over the fixture in `test/fixtures/spotify/`. Only GET works, so it can't change your library.

## `/v1/me`

Identify a Spotify Connection by `account_id`, not `id`. Spotify recommends it for account linking because it never changes for the life of the account.
