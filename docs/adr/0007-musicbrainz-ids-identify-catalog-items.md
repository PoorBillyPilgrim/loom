# MusicBrainz IDs identify Catalog Items

Every Catalog Item is identified by its MusicBrainz ID (MBID). A Spotify ID is linked to it when a Spotify-connected Listener's match finds one, and deleted when that Listener Disconnects Spotify. Listeners without Spotify have no Spotify IDs, while ListenBrainz playlists need recording MBIDs and the Export benefits from MusicBrainz's ISRCs. MusicBrainz covers about 3M artists and 40M recordings (Nov 2026) and is what Last.fm and ListenBrainz use. Names from MusicBrainz and Last.fm may be stored, since they aren't Spotify Content (see 0002).

Suggestions Loom can't confidently match to one MBID are dropped, and the drops are counted and logged. MusicBrainz is thin on very new releases and small Bandcamp-only artists, so this will sometimes hide exactly the artists Loom cares about; the counts are there to measure that cost before we revisit it.

## Considered Options

- **Spotify ID for everyone**, resolved with Spotify's app-only search (which doesn't count against the user cap). Rejected: it keeps every Listener's data under Spotify's policy and contradicts getting music into Spotify without the Spotify API (0008).
- **Normalized artist and title text.** Rejected: fragile with remasters, featured artists and artists sharing a name.
- **Keep unmatched suggestions as "Not in MusicBrainz"**, identified by name. Rejected for now: a second identity scheme for Dismiss and Known Items.
