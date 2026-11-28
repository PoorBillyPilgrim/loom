# Loom keeps its own copy of Listens

ListenBrainz holds each Listener's listening record, and Loom keeps its own copy of their Listens in D1 for charts, Seeds and Known Items. ListenBrainz's stats API alone would do for top artists, but it can't give Loom charts of its own design, drops nothing we'd want kept (0007 keeps unmatched Listens), and returns 204 until its daily stats job has run. A copy also leaves room for importing a Listener's Spotify extended streaming history later, with the skips and play lengths ListenBrainz doesn't have.

- The first copy is a ListenBrainz export ZIP the Listener downloads and uploads to Loom.
- After that, Loom fetches only new listens: when the Listening page opens, if the last fetch was more than about 15 minutes ago, and nightly from a Cron Trigger.
- Copied Listens are deleted when the Listener Disconnects ListenBrainz or Leaves.

Spotify's Developer Policy forbids analyzing Spotify Content for usage statistics or user metrics. Loom only analyzes Listens copied from ListenBrainz or uploaded by the Listener, never anything pulled through Loom's Spotify app. Don't add Spotify's recently-played endpoint as a way to fill gaps.

## Considered Options

- **Read ListenBrainz stats live, store nothing.** Less to build, but limited to ListenBrainz's own ranges and fields.
- **Loom as its own scrobbler**, receiving ListenBrainz-style submissions and polling Spotify. Rejected: ListenBrainz already does the Spotify part, and polling Spotify for stats runs into the policy above.
- **Loom runs the ListenBrainz export itself** (request, poll, download, unpack in a Worker). Deferred: it needs a background job and care with Workers' memory, and a one-time upload is fine for 25 Listeners.

## Consequences

When the Spotify file import arrives, it must not double-count Listens ListenBrainz already copied from Spotify.
