# Scrobbling apps: Koito and Multi-Scrobbler

Two open-source projects, looked at as prior art for reframing Loom as a personal scrobbling app with Explore as one part of it. Checked 2026-11-27 against each project's README, docs site and source (Koito at `a079fa6`, Multi-Scrobbler at `c9d8287`). Anything a primary source didn't confirm is marked **Unconfirmed**.

- [Koito](#koito) stores your listens and shows charts of them. It's the stats UI.
- [Multi-Scrobbler](#multi-scrobbler) watches players and services, then forwards plays to scrobble servers. It's the plumbing.
- [What this means for Loom](#what-this-means-for-loom)

## At a glance

|                         | Koito                                                      | Multi-Scrobbler                                                        |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Role                    | Scrobble server with a stats UI                            | Relay from Sources to scrobble Clients                                 |
| Stack                   | Go + SQLite, React Router client                           | Node/TypeScript + SQLite (Drizzle), React client                       |
| Deploy                  | One Docker container                                       | One Docker container (or Node, or Flatpak)                             |
| Receives scrobbles      | ListenBrainz API (`submit-listens`, `validate-token`)      | ListenBrainz API, Last.fm API, WebScrobbler                            |
| Polls Spotify           | No                                                         | Yes, every 10 s, plus a recently-played check every 15 min             |
| Keeps listens long term | Yes, that's its job                                        | No. Deletes Plays after 7 days by default                              |
| Identity                | MBID when the client sends one, otherwise name and aliases | Names plus optional IDs per credit, and an optional MusicBrainz lookup |
| Users                   | One in practice                                            | One admin, but it can scrobble for several people from config          |
| Recommendations         | None                                                       | None                                                                   |
| License                 | MIT                                                        | MIT                                                                    |
| Latest release          | v0.3.2, 2026-06-01                                         | 0.21.3, 2026-11-25                                                     |

## Koito

### What it is

- "A modern, themeable ListenBrainz-compatible scrobbler for self-hosters who want control over their data and insights into their listening habits" ([README](https://github.com/gabehf/koito/blob/main/README.md)). Live demo: <https://koito.mnrva.dev>.
- The README says it is "still considered 'unstable'", and that the main branch can break and breaking changes may happen ([README](https://github.com/gabehf/koito/blob/main/README.md)).
- MIT license ([LICENSE](https://github.com/gabehf/koito/blob/main/LICENSE)).
- Stack:
  - Go 1.25 server on chi ([go.mod](https://github.com/gabehf/koito/blob/main/go.mod), [engine/routes.go](https://github.com/gabehf/koito/blob/main/engine/routes.go)).
  - SQLite through `modernc.org/sqlite` with goose migrations.
  - React 19 + React Router 7 + TanStack Query + Recharts client ([client/package.json](https://github.com/gabehf/koito/blob/main/client/package.json)).
  - Images are processed with `libvips` ([installation guide](https://koito.io/guides/installation/)).
- Deploy: one Docker container (`gabehf/koito`) with a mounted config directory ([installation guide](https://koito.io/guides/installation/)).
  - SQLite has been the only database since v0.2.1. Postgres support was removed ([configuration reference](https://koito.io/reference/configuration/)).
- Maintenance, as of 2026-11-27 (from `gh api`):
  - 25 releases since 2025-06-15. The latest is [v0.3.2 on 2026-06-01](https://github.com/gabehf/koito/releases).
  - The last commit on `main` was 2026-07-23, and the maintainer's last issue comment was [2026-09-12](https://github.com/gabehf/Koito/issues/340#issuecomment-5646623687).
  - Community PRs from November 2026 are open and unmerged, e.g. [#382 "more complete listenbrainz api"](https://github.com/gabehf/Koito/pull/382). There are about 107 open issues.
  - In short: popular (about 1.3k stars), but quiet for four months.

### How listens get in

- **Receives scrobbles only. It never polls a service.**
  - Its only ingest is a ListenBrainz-compatible API at `/apis/listenbrainz/1`, with two routes: `POST /submit-listens` and `GET /validate-token` ([engine/routes.go#L138](https://github.com/gabehf/koito/blob/main/engine/routes.go#L138)).
  - The token is a Koito API key from the settings UI ([scrobbler guide](https://koito.io/guides/scrobbler/)).
- Any player that can scrobble to a custom ListenBrainz URL works. The docs walk through Navidrome ([Navidrome quickstart](https://koito.io/quickstart/navidrome/)).
- The handler accepts the `single`, `playing_now` and `import` listen types.
  - Requests other than `import` must carry exactly one listen.
  - `playing_now` is held in memory, not saved ([lbz_submit_listen.go#L132](https://github.com/gabehf/koito/blob/main/engine/handlers/lbz_submit_listen.go#L132)).
- **Spotify:** there's no Spotify connection. The only Go file that touches Spotify outside startup is the history importer ([internal/importer/spotify.go](https://github.com/gabehf/koito/blob/main/internal/importer/spotify.go)). Live Spotify listening has to come through something else that scrobbles to Koito, such as Multi-Scrobbler, which lists Koito as a Client ([MS README](https://github.com/FoxxMD/multi-scrobbler/blob/master/README.md)).
- Images come from Deezer, Cover Art Archive, a Subsonic server, or Last.fm when an API key is set ([configuration reference](https://koito.io/reference/configuration/)).

### Where listens go

- **Relay:** with `KOITO_ENABLE_LBZ_RELAY`, `KOITO_LBZ_RELAY_URL` and `KOITO_LBZ_RELAY_TOKEN` set, Koito forwards every submission to another ListenBrainz-compatible server, e.g. `https://api.listenbrainz.org/1` ([scrobbler guide](https://koito.io/guides/scrobbler/)).
  - It sends the raw request body in the background and retries 5xx errors for up to 3 minutes ([lbz_submit_listen.go#L252](https://github.com/gabehf/koito/blob/main/engine/handlers/lbz_submit_listen.go#L252)).
  - There's an open bug, [#350 "Relay to listenbrainz fails"](https://github.com/gabehf/Koito/issues/350).
- **Export:** `GET /apis/web/v1/export` returns the user's listens as JSON ([internal/export/export.go](https://github.com/gabehf/koito/blob/main/internal/export/export.go)).

### Data model

Schema: [db/migrations_sqlite/001_initial_schema.sql](https://github.com/gabehf/koito/blob/main/db/migrations_sqlite/001_initial_schema.sql). Migration [002](https://github.com/gabehf/koito/blob/main/db/migrations_sqlite/002_unique_mbid.sql) makes MBIDs unique.

- `artists`, `releases` and `tracks` each have an integer `id` and a **nullable, unique** `musicbrainz_id`.
  - Names aren't columns on those tables. They live in `artist_aliases`, `release_aliases` and `track_aliases`, each `(item, alias, source, is_primary)`.
  - The primary alias is the display name, and views such as `artists_with_name` join it in.
- `artist_tracks` and `artist_releases` are many-to-many, with an `is_primary` flag.
  - A track belongs to exactly one release (`tracks.release_id`). [#34](https://github.com/gabehf/Koito/issues/34) and the [roadmap](https://github.com/gabehf/Koito/issues/284) plan to let one track appear on several releases.
- Duration lives on the track (`tracks.duration`, in seconds), not on the listen.
  - So "minutes listened" assumes every play was a full play.
  - Imports without durations make it wrong ([importing guide](https://koito.io/guides/importing/)).
  - Open PR [#379](https://github.com/gabehf/Koito/pull/379) adds `duration_played`.
- **Per listen:** `track_id`, `listened_at` (unix seconds), `user_id` and `client`. Nothing else.
  - The primary key is `(track_id, listened_at)`, and inserts are `INSERT OR IGNORE`, so a resubmitted listen is silently deduplicated ([listen.go#L28](https://github.com/gabehf/koito/blob/main/internal/db/sqlite/listen.go#L28)).
- **Matching a submitted listen** ([catalog.go `SubmitListen`](https://github.com/gabehf/koito/blob/main/internal/catalog/catalog.go#L77)):
  1. Artists ([associate_artists.go](https://github.com/gabehf/koito/blob/main/internal/catalog/associate_artists.go#L31)): Koito tries the MBID mappings from `mbid_mapping`, then the listed artist MBIDs, then artist names.
     - Names are matched case-insensitively against all aliases.
     - When an MBID is new, Koito fetches the artist's aliases from MusicBrainz (`/ws/2/artist/{id}?inc=aliases`). If any alias matches an existing artist without an MBID, it attaches the MBID to that artist instead of creating a duplicate ([`resolveAliasOrCreateArtist`](https://github.com/gabehf/koito/blob/main/internal/catalog/associate_artists.go#L205)).
  2. Featured artists are split out of artist and title strings ("feat.", "&", "·", plus a regex you can configure) by [`ParseArtists`](https://github.com/gabehf/koito/blob/main/internal/catalog/catalog.go#L222).
  3. Album: by release MBID, otherwise by title and artist. Track: by recording MBID, otherwise by title, release and artists. When no match is found, a new item is created with whatever MBID was supplied ([associate_album.go](https://github.com/gabehf/koito/blob/main/internal/catalog/associate_album.go), [associate_track.go](https://github.com/gabehf/koito/blob/main/internal/catalog/associate_track.go)).
- **Koito never searches MusicBrainz for a missing MBID.** It only looks up MBIDs the client sends. The maintainer says so: "your music server or whatever is sending scrobbles to Koito must provide the MBID. Koito does not try to find a matching MBID by itself" ([#70](https://github.com/gabehf/Koito/issues/70)). The MusicBrainz client only calls lookups by ID ([internal/mbz](https://github.com/gabehf/koito/tree/main/internal/mbz)).
- **Fixing data by hand** ([editing guide](https://koito.io/guides/editing/)):
  - Add, remove or make primary an alias. Aliases are also used for matching and search.
  - Add or remove artist associations, and set an item's MBID.
  - Merge two artists, albums or tracks. Children and listens move to the item kept. Merges can't be undone.
  - Delete an item along with its listens.

### Stats and pages

Pages ([client/app/routes.ts](https://github.com/gabehf/koito/blob/main/client/app/routes.ts)): Home, Artist, Album, Track, top-albums, top-artists and top-tracks charts, Listens (history), and Rewind. Screenshots: [README](https://github.com/gabehf/koito/blob/main/README.md#screenshots), [1](https://github.com/gabehf/koito/blob/main/assets/screenshot1_2.png), [2](https://github.com/gabehf/koito/blob/main/assets/screenshot2.png), [3](https://github.com/gabehf/koito/blob/main/assets/screenshot3.png).

- **Home** ([Home.tsx](https://github.com/gabehf/koito/blob/main/client/app/routes/Home.tsx)):
  - All-time stats.
  - An activity heatmap.
  - A period switch (Day, Week, Month, Year, All Time) that drives top artists, top albums and top tracks (10).
  - Last played (28), with now playing.
- **Period filters:** the API also takes `year`, `month`, `week`, or `from`/`to` unix times, plus a timezone from a cookie, a query parameter, or `KOITO_FORCE_TZ` ([handlers.go#L53](https://github.com/gabehf/koito/blob/main/engine/handlers/handlers.go#L53)).
- **Stats endpoint** ([stats.go#L14](https://github.com/gabehf/koito/blob/main/engine/handlers/stats.go#L14)):
  - Counts of listens, tracks, albums and artists.
  - Minutes listened and days active.
  - Longest streak and average daily plays.
  - Tracks per artist and albums per artist.
- **Activity heatmap:** each cell is a day, week or month, over 105, 182 or 364 days ([ActivityOptsSelector.tsx#L19](https://github.com/gabehf/koito/blob/main/client/app/components/ActivityOptsSelector.tsx#L19)). It also appears on Artist, Album and Track pages.
- **Artist, album and track pages** ([Artist.tsx](https://github.com/gabehf/koito/blob/main/client/app/routes/MediaItems/Artist.tsx)):
  - An "Interest over time" area chart: listens split into 16 equal time buckets from the first listen to now ([InterestGraph.tsx#L19](https://github.com/gabehf/koito/blob/main/client/app/components/InterestGraph.tsx#L19), [interest.go](https://github.com/gabehf/koito/blob/main/internal/db/sqlite/interest.go)).
  - Top tracks and albums.
  - Last played.
- **Rewind** (`/rewind?year=&month=`) is a "Your <month> <year> Rewind" summary ([RewindPage.tsx](https://github.com/gabehf/koito/blob/main/client/app/routes/RewindPage.tsx), [summary.go#L11](https://github.com/gabehf/koito/blob/main/internal/summary/summary.go#L11)):
  - Top 5 artists, albums and tracks, each with plays and time listened.
  - Minutes, plus average minutes per day.
  - Plays, plus average plays per day.
  - Unique tracks, albums and artists.
  - New tracks, albums and artists.
- Twelve built-in themes and custom themes ([docs home](https://koito.io/)).
- Stats are public by default. `KOITO_LOGIN_GATE=true` hides them unless you're logged in ([configuration reference](https://koito.io/reference/configuration/)).

### Importing history

From the [importing guide](https://koito.io/guides/importing/). You drop the file in `import/` under the config directory and restart.

| Import                             | How Koito reads it                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Spotify extended streaming history | `Streaming_History_Audio*.json` files                                                  |
| Last.fm                            | JSON from the third-party exporter lastfm.ghan.nl, file name containing `recenttracks` |
| ListenBrainz                       | The `.zip` from ListenBrainz's own export page                                         |
| Maloja                             | Maloja's JSON export                                                                   |

- The Spotify importer ([spotify.go#L48](https://github.com/gabehf/koito/blob/main/internal/importer/spotify.go#L48)):
  - It keeps only entries whose `reason_end` is `trackdone`, so skipped and partial plays are dropped.
  - It matches by name only. It reads artist, track and album names and ignores `spotify_track_uri`.
  - It always files listens under user 1 (`UserID: 1`).
- The Last.fm importer passes along the MBIDs in the export ([lastfm.go](https://github.com/gabehf/koito/blob/main/internal/importer/lastfm.go)).
- Imports are slow on large histories because of MusicBrainz's 1 request per second limit. You can turn MusicBrainz off or point it at a mirror ([importing guide](https://koito.io/guides/importing/)).
- The Koito docs say Spotify's export "could take up to 30 days, according to Spotify". Spotify's own page says the extended history covers "the lifetime of your account" but doesn't state a delivery time ([Spotify: Understanding my data](https://support.spotify.com/us/article/understanding-my-data/)).

### Users and auth

- Username and password login (default `admin` / `changeme`). Login is rate-limited to 10 a minute. Sessions are stored in the database ([configuration reference](https://koito.io/reference/configuration/), [engine/routes.go](https://github.com/gabehf/koito/blob/main/engine/routes.go)).
- API keys, which can be labelled, serve as ListenBrainz tokens.
- The schema has a `users` table with an `admin` or `user` role, but **in practice Koito is single-user**:
  - Stats queries don't filter by user, e.g. `SELECT COUNT(*) FROM listens WHERE listened_at BETWEEN ? AND ?` ([counts.go](https://github.com/gabehf/koito/blob/main/internal/db/sqlite/counts.go)).
  - The listens primary key leaves out `user_id`.
- Multi-user support is open as "[Low Prio]" ([#11](https://github.com/gabehf/Koito/issues/11)). The maintainer calls it "a solid maybe".
  - The suggested workaround is one Koito instance per person, behind a small token-routing proxy, [koito-multi-proxy](https://github.com/gabehf/koito-multi-proxy).
  - An OIDC login request is open ([#388](https://github.com/gabehf/Koito/issues/388)).

### Recommendations

- None. Nothing in the routes, client pages or roadmap ([#284](https://github.com/gabehf/Koito/issues/284)) covers discovery.

## Multi-Scrobbler

### What it is

- "A dockerized app that monitors your music listening activity from _everywhere_ and scrobbles it _anywhere_" ([README](https://github.com/FoxxMD/multi-scrobbler/blob/master/README.md)).
- Aimed at self-hosters, including people who scrobble on behalf of friends and family.
- MIT license ([LICENSE](https://github.com/FoxxMD/multi-scrobbler/blob/master/LICENSE)).
- Stack:
  - TypeScript on Node ≥ 24 ([package.json](https://github.com/FoxxMD/multi-scrobbler/blob/master/package.json)).
  - A SQLite database (`ms.db`) through Drizzle ([drizzle.config.ts](https://github.com/FoxxMD/multi-scrobbler/blob/master/drizzle.config.ts)).
  - An optional Valkey cache ([installation](https://docs.multi-scrobbler.app/installation)).
  - A React web dashboard.
- Deploy: a Docker image, Node, or Flatpak ([installation](https://docs.multi-scrobbler.app/installation), [flatpak/](https://github.com/FoxxMD/multi-scrobbler/tree/master/flatpak)). It's a long-running process with its own schedulers.
- Maintenance, as of 2026-11-27 (from `gh api`):
  - Very active. 116 releases since 2020. The latest is [0.21.3 on 2026-11-25](https://github.com/FoxxMD/multi-scrobbler/releases), and 0.21.0 came on 2026-11-11.
  - There were 100+ commits in the past month, and the last one was today.
  - About 1.4k stars and 34 open issues.

### How listens get in

A **Source** either polls a service ("Active") or waits for the service to send data ("Ingress"). For each Source, the truth is either live player state or the service's own scrobble history ([Sources](https://docs.multi-scrobbler.app/configuration/sources)).

- **Sources** ([README](https://github.com/FoxxMD/multi-scrobbler/blob/master/README.md)):
  - Spotify, Apple Music, Deezer and YouTube Music.
  - Jellyfin, Plex, Subsonic/Navidrome, Kodi and Sonos.
  - Last.fm, ListenBrainz, Koito, Maloja, Libre.fm, Rocksky and teal.fm.
  - MPD, MPRIS, VLC and WebScrobbler.
  - About 30 in all.
- **It acts as a scrobble server too:**
  - The [ListenBrainz (Endpoint)](https://docs.multi-scrobbler.app/configuration/sources/listenbrainz-endpoint) Source accepts scrobbles "as if it was a Listenbrainz server" at `/1/*`.
  - The [Last.fm (Endpoint)](https://docs.multi-scrobbler.app/configuration/sources/lastfm-endpoint) Source does the same at `/2.0/`.
  - Different tokens or URL slugs route to different Sources, so different people can use them. The docs recommend the ListenBrainz endpoint over Last.fm's, because Last.fm merges multiple artists into one string.
- **ListenBrainz and Last.fm as Sources** poll the user's history (`/1/user/{name}/listens` and `user.getRecentTracks`) and forward new entries ([ListenbrainzApiClient.ts](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/vendor/ListenbrainzApiClient.ts), [LastfmApiClient.ts](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/vendor/LastfmApiClient.ts)).
  - The docs warn that Last.fm API keys need a Pro account from 2026-12-01, so the Last.fm Source and Client stop working without one ([Last.fm Client](https://docs.multi-scrobbler.app/configuration/clients/lastfm)).
- **Scrobble thresholds:** a live play counts after 50% of the track or 4 minutes, following Last.fm's guidance. Both can be configured ([Sources](https://docs.multi-scrobbler.app/configuration/sources)).

#### Spotify specifically

From the [Spotify Source docs](https://docs.multi-scrobbler.app/configuration/sources/spotify) and [SpotifySource.ts](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/SpotifySource.ts):

- **Setup.** Each self-hoster creates their own Spotify app.
  - Since 2026-03-09 that app must be owned by a Premium account. A non-Premium user can be added to a Premium friend's app.
  - Scopes are `user-read-recently-played`, `user-read-currently-playing`, `user-read-playback-state` and `user-read-playback-position` ([#L48](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/SpotifySource.ts#L48)).
- **Live tracking.** It polls playback state every **10 s** by default, with backoff up to 30 s ([Atomic.ts#L136](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/infrastructure/Atomic.ts#L136)).
  - It warns below 5 s because "Spotify may return 429".
  - It ignores devices in a private session ([#L389](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/SpotifySource.ts#L389)).
  - It scrobbles once a play passes the threshold.
- **Backlog and reconcile.**
  - On startup, and every **15 minutes** after ([#L679](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/SpotifySource.ts#L679)), it reads `recently-played` to backfill plays missed while it was down or during device switches.
  - Those plays are deduplicated against what it already tracked live.
  - The backlog depth is set to 50 with a link to Spotify's reference ([#L84](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/SpotifySource.ts#L84)).
- **Backlog skips the threshold.** The docs say recently-played logs any play of about 30 s or more and carries no play duration. Backfilled plays are therefore scrobbled even when they would fail the 50% or 4-minute rule. `scrobbleBacklog: false` turns this off.
  - **Unconfirmed:** Spotify's reference doesn't state the 30-second rule.
- **ISRC.** `currently-playing` doesn't return a track's ISRC, so it makes one extra `tracks/{id}` call per track. MS uses ISRCs to match against MusicBrainz and the scrobble Clients.
- **Automix.** Automix shortens plays, and Spotify's API doesn't report it, so durations can be wrong.

### Where listens go

- **Clients:** Koito, ListenBrainz, Last.fm, Libre.fm, Maloja, Rocksky, teal.fm, Blackbox, and Discord (now playing only) ([README](https://github.com/FoxxMD/multi-scrobbler/blob/master/README.md), [Clients](https://docs.multi-scrobbler.app/configuration/clients)).
- Each Source can be limited to named Clients. Without a list, it scrobbles to all of them.
- Failed scrobbles are queued and retried, and you can watch Source and Client health through webhooks, health endpoints and Prometheus ([README](https://github.com/FoxxMD/multi-scrobbler/blob/master/README.md)).
- Before scrobbling, it checks the Client's recent history for duplicates. Matching uses normalized, word-order-insensitive Levenshtein and Dice similarity, and splits joined artist strings ([duplicates](https://docs.multi-scrobbler.app/configuration/duplicates)).

### Data model

- **A Play** ([src/core/Atomic.ts#L184](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/core/Atomic.ts#L184)) has a `track`, `artists[]`, `albumArtists[]` and `album`, plus `duration`, `playDate`, `listenedFor`, `isrc`, and meta such as source, music service, track ID and `parsedFrom`.
  - Each of those is a **Credit**: a name plus optional `metadata[]` of IDs from music services. MBIDs are stored on the credit they identify.
  - So there's no catalog table of artists or tracks. Identity travels with each Play.
- **Storage:** the `plays` table ([schema.ts#L71](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/database/drizzle/schema/schema.ts#L71)) has:
  - The Play as JSON.
  - A `state`: queued, discovered, discarded, scrobbled, failed, duped or review.
  - `playedAt` and `seenAt` times, a `playHash`, an `mbidIdentifier`, and the owning Source or Client.
  - Raw input from the service and each transform step are kept in separate rows and "compacted" (deleted) after 3 days by default.
- **Not a long-term store.** "Multi-Scrobbler is not designed to store Plays/Scrobbles indefinitely… It is not a scrobbler server." Plays are deleted after 7 days by default ([Database → Retention](https://docs.multi-scrobbler.app/configuration#database)).
- **Fixing names (Transforms):**
  - User regex and search rules.
  - A **MusicBrainz** stage that searches MusicBrainz, then corrects names and adds MBIDs when the match score is high enough. It can share load across several mirrors ([MusicBrainz stage](https://docs.multi-scrobbler.app/configuration/transforms/musicbrainz)).
  - A **Spotify** stage that matches against Spotify's catalog with app-only credentials, which still need a Premium-owned app ([Spotify stage](https://docs.multi-scrobbler.app/configuration/transforms/spotify)).
  - Cover Art Archive and Rocksky stages.

### Stats and pages

- The dashboard is for operations, not listening stats.
  - The README describes it as a "web interface for stats, control, scrobble audit trail, and logs".
  - Routes are home, a page per Source or Client, Jobs, Mirrors, settings, login and setup ([App.tsx](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/client/App.tsx#L78)).
  - Screenshots: [msDash](https://github.com/FoxxMD/multi-scrobbler/blob/master/docsite/public/img/msDash.png), [msClientTimeline](https://github.com/FoxxMD/multi-scrobbler/blob/master/docsite/public/img/msClientTimeline.png), [msTransform](https://github.com/FoxxMD/multi-scrobbler/blob/master/docsite/public/img/msTransform.png).
- There are no top-artist charts or listening heatmaps. Those are left to the Clients (Koito, ListenBrainz, Maloja).
- 0.21.0 added a "Public Dashboard" ([release notes](https://github.com/FoxxMD/multi-scrobbler/releases/tag/0.21.0)).

### Importing history

- **Import/Export Jobs** ([transfer overview](https://docs.multi-scrobbler.app/transfer/overview)):
  - A Job imports Plays into a **Mirror**, a saved copy of history in MS's database.
  - Each Mirror records which date ranges it fully covers. It can mix sources, e.g. Last.fm for 2008 to 2012 and a file for 2013 onward.
  - The Job can then export the Mirror to Clients at the Client's scrobble interval, 1 a second by default. Plays already sent are skipped.
  - Jobs resume after a restart.
  - The Mirror tables are `play_mirrors` and `plays_historical` ([schema.ts#L115](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/database/drizzle/schema/schema.ts#L115)).
- **Sources you can import from today:** only Last.fm, through the API or a file from lastfm.ghan.nl or benjaminbenben. "More sources will come later."
  - **Not supported yet:** Spotify extended streaming history and ListenBrainz exports.
- The docs warn not to export old history to Last.fm or Libre.fm, because they refuse plays older than about 14 days.

### Users and auth

- Since 0.21.0 there's **single-user** login built on Better-Auth.
  - On first start it creates one `admin` account. API keys can be scoped to Read.
  - Until a password is set, anyone who can reach the dashboard can use it ([authentication](https://docs.multi-scrobbler.app/security/authentication), [release notes](https://github.com/FoxxMD/multi-scrobbler/releases/tag/0.21.0)).
  - `AUTH_MODE=disabled` defers to a reverse proxy instead ([security overview](https://docs.multi-scrobbler.app/security/overview)).
- "Multiple users" in the README means the admin configures separate Sources and Clients per person, e.g. Fred's Jellyfin to Fred's Last.fm, Mary's to Mary's ([kitchen-sink example](https://github.com/FoxxMD/multi-scrobbler/blob/master/docsite/src/content/docs/configuration/_kitchensink_configs/_multi-persons-services.mdx)).
  - Other people don't sign in.
  - The docs say "MS will likely support multiple users in the future" ([security overview](https://docs.multi-scrobbler.app/security/overview)).
- The ingest endpoints (ListenBrainz, Last.fm, WebScrobbler) sit outside login and use their own tokens.

### Recommendations

- None. "Recommend" appears in the source only in unrelated contexts.

## What this means for Loom

### Spotify policy comes first

The [Spotify Developer Policy](https://developer.spotify.com/policy), section III "Some prohibited applications", says:

- Item 13: "Do not analyze the Spotify Content or the Spotify Service for any purpose, including without limitation, creating new or derived listenership metrics, benchmarking, functionality, usage statistics, user metrics, or building profiles of users…"
- Item 9: "Do not build an SDA that enables the transfer of data to another service, except for the purpose of enabling a user to transfer their personal data…"

What follows from that:

- A Loom stats page built from listens it pulled from Spotify's API looks like "usage statistics" built from Spotify data. That cuts against ADR 0001 and 0002.
- **Unconfirmed:** whether a user's own recently-played history counts as "Spotify Content" here. The policy defers that definition to the Developer Terms, which I didn't check.
- **Unconfirmed:** whether forwarding a Listener's plays to their own ListenBrainz account fits item 9's personal-data exception.
- ListenBrainz and Multi-Scrobbler both poll Spotify for listening history. I found no primary source on Spotify's view of that.

### Reuse or build?

- **Neither runs on Cloudflare Workers.**
  - Koito is a long-running Go server with a SQLite file and `libvips`.
  - Multi-Scrobbler is a long-running Node process with its own schedulers and a SQLite file.
  - Either one would need a separate always-on host, the "server to look after" that ADR 0005 turned down.
- **Koito as the stats UI:** it's single-user in practice ([#11](https://github.com/gabehf/Koito/issues/11)), so 25 Listeners would mean 25 instances.
  - It has no Google sign-in or invites.
  - It has had no maintainer commits since July 2026.
  - It works as design reference, not as a component.
- **Multi-Scrobbler as the feed:** one admin configures everyone's Sources, and each Listener's Spotify must be authorized in MS's dashboard, through an app the admin owns.
  - That app has its own five-user dev-mode cap, separate from Loom's.
  - This is the kind of central account handling Loom's Connections were designed to avoid.
- **ListenBrainz already does the Spotify part. This is the strongest option for Loom.**
  - **Live recording:** a Listener can connect Spotify inside ListenBrainz. ListenBrainz's own importer polls `currently-playing`, then `recently-played` with `limit=50` and `after=<last import>` ([listens_importer/spotify.py](https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/listens_importer/spotify.py)), looping over connected users and pausing 10 s only when there are fewer users than one batch ([base.py](https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/listens_importer/base.py)). **Unconfirmed:** how often a given user is polled in practice.
  - **Past history:** ListenBrainz imports Spotify extended streaming history.
    - It skips private-session plays, and plays under 30 s that were skipped or ended by the user.
    - It looks up Spotify metadata for each track ([background/listens_importer/spotify.py#L39](https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/background/listens_importer/spotify.py#L39)).
    - It also imports Last.fm, Libre.fm, Maloja, Panoscrobbler and ListenBrainz files ([background/listens_importer/](https://github.com/metabrainz/listenbrainz-server/tree/master/listenbrainz/background/listens_importer)).
  - **Stats:** ListenBrainz has a stats API under `/1/stats/user/{user}/`:
    - Endpoints: `artists`, `releases`, `release-groups`, `recordings`, `listening-activity`, `daily-activity`, `artist-activity`, `era-activity`, `genre-activity`, `artist-evolution-activity`, `artist-map`, and `year-in-music/{year}`.
    - Ranges run from `this_week` to `all_time` ([statistics API](https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html)).
    - **Unconfirmed:** how often those stats are recalculated. The docs don't say.
  - **What this route would mean for Loom:**
    - Loom would pull no Spotify listening data itself, and wouldn't spend any of its five Spotify slots.
    - Listening data would live in the Listener's own ListenBrainz account. Loom would read it there and identify it by MBID, matching ADR 0007.
    - **Unconfirmed:** whether ListenBrainz's Spotify app has its own user cap.
- **Building scrobbling into Loom.** These parts fit Workers:
  - A ListenBrainz-compatible `POST /1/submit-listens` + `GET /1/validate-token` ingest, which is all Koito implements. Navidrome, Panoscrobbler and friends could then scrobble straight to Loom, and Loom could pass listens on to ListenBrainz the way Koito's relay does.
  - Imports of history files.
  - Stats queries in D1.
  - **The hard part is Spotify:** the policy questions above, a new `user-read-recently-played` scope (Loom asks for five scopes today, see `docs/spotify-api.md`), the five-user cap, and refresh tokens that now expire.

### Can polling recently-played capture full history?

- **Spotify's limits:**
  - The reference allows at most 50 items per request, with `before` or `after` cursors, and says it "doesn't support podcast episodes" ([Get Recently Played Tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)).
  - **Unconfirmed:** how far back paging goes. The reference doesn't say. Multi-Scrobbler and ListenBrainz both treat 50 as the most they can get back, so a poller has to run before a Listener plays 50 tracks.
  - My estimate: at about 3.5 minutes a track, that's roughly 3 hours of non-stop listening.
- **Lag:** ListenBrainz's maintainer docs say "Sometimes spotify's recent listens API does not show updated listens for hours while the currently playing endpoint does" ([spotify-reader.rst](https://github.com/metabrainz/listenbrainz-server/blob/master/docs/maintainers/spotify-reader.rst)).
- **How the projects cope:**
  - Multi-Scrobbler polls currently-playing every 10 s for accuracy and checks recently-played every 15 min to fill gaps.
  - ListenBrainz polls both.
  - Koito doesn't poll at all.
- **What Workers can do:** a Cron Trigger can run at most once a minute ([Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). That's enough for recently-played polling, though not for 10 s now-playing tracking.
  - My arithmetic: 25 Listeners × one call every 5 to 15 minutes is a modest request load, before checking Spotify's rate limits.
- **Re-authorization:** since 2026-07-20, refresh tokens for existing apps expire **6 months** after the user authorized, and Spotify then returns `invalid_grant` ([Spotify blog](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration)). Any background poller needs a re-connect prompt. ListenBrainz handles this as an error the user sees ([listens_importer/spotify.py](https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/listens_importer/spotify.py)).
- **Older history:** polling only captures listening from when it starts. Anything earlier needs Spotify's extended streaming history, which covers the life of the account ([Spotify: Understanding my data](https://support.spotify.com/us/article/understanding-my-data/)). Koito and ListenBrainz import it. Multi-Scrobbler doesn't yet.

### Ideas worth borrowing

- **From Koito's data model:**
  - Names live in alias tables (`alias`, `source`, `is_primary`) instead of a single name column.
  - When a new MBID arrives, Koito checks its MusicBrainz aliases against existing artists that have no MBID, which merges duplicates automatically.
  - Manual merge and set-MBID tools cover what's left.
  - This bears on ADR 0007's choice to drop anything without an MBID: Koito keeps unmatched items by name and lets an MBID attach later.
- **From Koito's listen rows:**
  - A listen is just `(track, listened_at, user, client)`. Resubmissions are deduplicated by key with `INSERT OR IGNORE`.
  - In Loom the key should include the Listener.
  - Duration of play belongs on the listen, not the track, which Koito is now [adding](https://github.com/gabehf/Koito/pull/379).
- **From Koito's stats pages:**
  - A Day/Week/Month/Year/All Time switch driving top artists, albums and tracks.
  - An activity heatmap with a configurable step.
  - An "interest over time" curve per artist, album or track.
  - A monthly or yearly Rewind with _new_ artists, albums and tracks. "New artists this month" is a natural bridge to Explore.
  - Streaks and days active.
- **From Multi-Scrobbler's ingest:**
  - Live and backlog plays each record where they came from (`parsedFrom`), and are deduplicated where the two overlap.
  - Explicit play states (discovered, scrobbled, duped, failed).
  - Raw input is kept briefly for debugging, then compacted.
  - Import Mirrors record which date ranges they cover, so overlapping imports (Last.fm, then a file) don't double-count.
  - Scrobble thresholds follow Last.fm's 50% or 4-minute rule.
- **From both:** accept the ListenBrainz submit API as the one way in, and treat Spotify as just another client feeding it, whether through ListenBrainz's own Spotify connection or something like Multi-Scrobbler. This keeps Loom off Spotify's listening data entirely.
