# Keep without the Spotify API

Listeners without a Spotify Connection get their kept Tracks into Spotify, or any other streaming service, without Loom calling Spotify. Kept Tracks go to a Loom Playlist on ListenBrainz, which the Listener syncs onward with ListenBrainz's own export or Soundiiz. Any Listener can also download an Export: a CSV of artist, title, album and ISRC for the Tracks kept since their last Export, which TuneMyMusic imports. Kept Artists and Albums are only recorded, with their Bandcamp Link, because none of these routes can follow an Artist or save an Album. When Spotify is connected, Keep still goes straight to Spotify.

## Considered Options

- **Spotify's "Import your music"** (Nov 2025, run by TuneMyMusic). Rejected: it imports playlists from other streaming services, not from a file.
- **Pasting `spotify:track:` URIs into a desktop playlist.** Rejected: reported as unreliable, and it needs Spotify IDs, which means calling the API anyway.
- **Per-item "Open in Spotify" links only.** Rejected as the main route: a click per Track. Fine as a supplement.

## Consequences

ListenBrainz's export to Spotify silently drops Tracks it can't match (about 22% in one community report), which is why the Export exists as well.
