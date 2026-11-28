# MusicBrainz IDs identify Catalog Items

Every Catalog Item is identified by its MusicBrainz ID (MBID). A Spotify ID is linked to it when a Spotify-connected Listener's match finds one, and deleted when that Listener Disconnects Spotify. Listeners without Spotify have no Spotify IDs, while ListenBrainz playlists need recording MBIDs and the Export benefits from MusicBrainz's ISRCs. MusicBrainz covers about 3M artists and 40M recordings (Nov 2026) and is what Last.fm and ListenBrainz use. Names from MusicBrainz and Last.fm may be stored, since they aren't Spotify Content (see 0002).

Suggestions Loom can't confidently match to one MBID are dropped, and the drops are counted and logged. MusicBrainz is thin on very new releases and small Bandcamp-only artists, so this will sometimes hide exactly the artists Loom cares about; the counts are there to measure that cost before we revisit it. Today's Sources, ListenBrainz and MusicBrainz relationships (0009), return MBIDs, so nothing is dropped and nothing is counted. The count comes back if a Source that matches by name, such as Last.fm, is added.

Listens are not Catalog Items, so this rule doesn't apply to them. Every Listen is kept with the names it came with, plus an MBID when ListenBrainz matched one. Dropping unmatched Listens would quietly remove plays from a Listener's charts, mostly of the small artists MusicBrainz lacks. Charts group by MBID where there is one, and by tidied name otherwise.

## Considered Options

- **Spotify ID for everyone**, resolved with Spotify's app-only search (which doesn't count against the user cap). Rejected: it keeps every Listener's data under Spotify's policy and contradicts getting music into Spotify without the Spotify API (0008).
- **Normalized artist and title text.** Rejected: fragile with remasters, featured artists and artists sharing a name.
- **Keep unmatched suggestions as "Not in MusicBrainz"**, identified by name. Rejected for now: a second identity scheme for Dismiss and Known Items.
