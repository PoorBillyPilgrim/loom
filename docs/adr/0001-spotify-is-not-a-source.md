# Spotify is not a Source

Spotify's Developer Policy and Terms (effective 2025-05-15) prohibit transferring Spotify Content to third parties and ingesting it into ML or AI models, and since Nov 2024 dev-mode apps can't use Spotify's recommendation, related-artist, or audio-feature endpoints anyway. Loom therefore uses Spotify only for Listeners who connect it (see 0006), and only for recent-listening Seeds, Known Item checks, and Keep (follow, save, add to the Loom Playlist). The only Spotify data that leaves Loom is artist and track names sent to Last.fm and ListenBrainz as Seeds. We don't use ReccoBeats or MusicAPI, and we don't train or feed any model on Spotify data.

## Considered Options

- **Strict**: Seeds only from Last.fm/ListenBrainz history. Rejected for now because the Listener's Last.fm scrobbling began in Nov 2026, leaving almost no history to seed from.
- **Use every Source, including ReccoBeats** (which accepts Spotify IDs). Rejected: this directly conflicts with the no-transfer rule, and ReccoBeats is a small "as is" service that appears to be built on Spotify-derived data.
