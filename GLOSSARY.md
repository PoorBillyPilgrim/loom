# Loom

Loom gathers music recommendations from several outside services into one place, where a Listener decides what to keep, then sends keepers to their streaming service and points to the artist on Bandcamp.

## People

**Listener**:
A person invited to Loom who signs in with their Google account. Loom has at most 25.
_Avoid_: User, account, member

**Invite**:
An email address allowed to sign in to Loom. Only Invited people can become Listeners.
_Avoid_: Allowlist, whitelist, signup

**Connection**:
An outside account a Listener links to Loom: Spotify, Last.fm, or ListenBrainz. Connections supply listening history, Known Items, or a Loom Playlist. None is used to sign in. At most five Listeners can connect Spotify.
_Avoid_: Integration, login, linked account

**Disconnect**:
Unlinking one Connection. Loom deletes everything it got from that Connection and keeps the Listener's Triage decisions.
_Avoid_: Unlink, remove, log out

**Leave**:
A Listener leaving Loom. Everything Loom holds about them is deleted immediately, with no grace period.
_Avoid_: Deactivate, Disconnect, delete account

## Recommendations

**Recommendation**:
One Catalog Item suggested to a Listener, carrying one or more Reasons. The more Reasons it has, the higher it ranks.
_Avoid_: Suggestion, rec, pick

**Reason**:
One Source suggesting a Catalog Item because of one Seed, e.g. "Last.fm: similar to Big Thief".
_Avoid_: Match, hit, signal

**Catalog Item**:
An Artist, Album, or Track listed in MusicBrainz. Playlists are never Catalog Items, and suggestions Loom can't find in MusicBrainz are dropped.
_Avoid_: Entity, media, content

**Source**:
An outside service that produces Recommendations, e.g. Last.fm.
_Avoid_: Provider, feed, integration

**Seed**:
The Artist, Track, or Tag a Source starts from when suggesting something, e.g. Big Thief. An Album used as a Seed stands in for its Artist.
_Avoid_: Basis, input, origin

**Tag**:
A crowd-sourced genre or mood label from Last.fm, e.g. "shoegaze".
_Avoid_: Genre, category, style

**Exploration**:
An on-demand request where the Listener picks a Seed and Loom asks the Sources for Recommendations right away.
_Avoid_: Search, query

**Digest**:
A batch of up to about 30 new Recommendations built from the Listener's recent listening across all their Connections. It runs every Monday morning, and the Listener can also run one on demand. A Listener with no listening Connection gets no Digest.
_Avoid_: Feed, weekly, report

## Triage

**Inbox**:
The Recommendations a Listener has not triaged yet.
_Avoid_: Queue, feed

**Triage**:
Deciding what happens to a Recommendation: Keep, Dismiss, or Snooze. Loom remembers every decision.
_Avoid_: Review, rate

**Keep**:
Accepting a Recommendation. A kept Track goes to the Loom Playlist. A kept Artist or Album is followed or saved on Spotify when Spotify is connected, and otherwise recorded with its Bandcamp Link.
_Avoid_: Save, like, approve

**Dismiss**:
Rejecting a Recommendation so that no Source can bring the same Catalog Item back. Dismissing an Artist also blocks their Albums and Tracks.
_Avoid_: Delete, hide, skip

**Snooze**:
Setting a Recommendation aside until the next Digest.
_Avoid_: Later, defer, remind

**Known Item**:
A Catalog Item the Listener already knows: one they've kept, played a few times on any Connection, or have on Spotify (a followed Artist, a saved Album, or a Track in Liked Songs or the Loom Playlist). Known Items never reach the Inbox.
_Avoid_: Duplicate, owned

**Not on Spotify**:
A Recommendation whose Catalog Item Loom could not confidently find on Spotify. It can still be kept; keeping it records it and shows its Bandcamp Link. Only applies to Listeners with Spotify connected.
_Avoid_: Unmatched, missing

## Destinations

**Loom Playlist**:
The playlist where Loom puts a Listener's kept Tracks: on Spotify when Spotify is connected, otherwise on ListenBrainz. On Spotify it is kept apart from Liked Songs on purpose.
_Avoid_: Inbox playlist, Liked Songs

**Export**:
A file of the Tracks a Listener kept since their last Export, for moving into Spotify or another streaming service with a converter such as TuneMyMusic.
_Avoid_: Download, backup

**Bandcamp Link**:
A link to an Artist's Bandcamp page, so the Listener can buy music and merch there.
_Avoid_: Bandcamp integration, wishlist
