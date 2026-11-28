# ListenBrainz replaces Last.fm

From 2026-12-01 a Last.fm API key only works while its owner pays for Last.fm Pro (about $5/month), and that covers every read method Loom planned to use: similar artists, Tags, and a Listener's plays. Rather than pay before we know Loom needs it, ListenBrainz is Loom's first Source and its listening Connection. It's free, open, and identifies everything by MusicBrainz ID, which Loom already uses (0007).

- Similar artists come from ListenBrainz's labs `similar-artists` endpoint, which returns scored, MBID-identified artists. It's undocumented and experimental, so it stays inside the ListenBrainz client, with the documented LB Radio artist endpoint as the fallback.
- ListenBrainz is one Source, however many of its algorithms Loom uses. Reasons stack across Seeds and across services, not across ListenBrainz's own algorithms, so ranking still measures agreement.
- Seeds are identified in MusicBrainz before Loom explores them, because ListenBrainz takes MBIDs, not names.
- Genres come from MusicBrainz's curated genre list instead of Last.fm tags.

We'll consider bringing Last.fm back later, as a paid Source and as a Connection, if ListenBrainz alone turns out thin. Both need the same Pro-owned key.

## Considered Options

- **Pay for Last.fm Pro** and keep the original plan. One key for the whole app, so $5/month in total. Not rejected for good, just deferred: it doubles Loom's running cost, Last.fm changed its terms with a week's notice, and it matches artists by name rather than MBID.
- **LB Radio's artist endpoint** as the main similarity call. Documented, but it returns no scores, includes the Seed, and gave looser matches (The Strokes for Big Thief).
- **MusicBrainz alone.** It has no similarity data. Its artist relationships (shared members, side projects) are planned as a smaller second Source.
