# Google sign-in, with Spotify, Last.fm and ListenBrainz as Connections

Listeners sign in to Loom with Google (`openid email profile`, which are non-sensitive scopes that need no Google app verification), and only Invited email addresses get in. Spotify, Last.fm and ListenBrainz are Connections a Listener links afterward; none of them is a login. Since March 2026, Spotify's Development Mode allows 5 users per app and needs a Premium owner, so a Spotify sign-in would cap Loom at five and shut out people who don't use Spotify. Google gives every Listener one stable identity that survives Disconnecting any Connection, and turns invite-only into a list of email addresses.

## Considered Options

- **Sign in with any Connection** (Spotify, Last.fm or MusicBrainz). Rejected for now: four login flows, plus merging when one person signs in two ways, and invites would need links instead of an email list. We may revisit this and add other sign-in options later.
- **MusicBrainz OAuth.** Rejected: it proves who someone is but can't write ListenBrainz playlists, because ListenBrainz only accepts personal user tokens. Listeners paste that token when they connect ListenBrainz.
- **Spotify sign-in** (the original plan). Rejected because of the 5-user cap.
