# Store Spotify IDs, not Spotify content

Spotify's Developer Policy forbids storing Spotify Content indefinitely and requires deleting a Listener's data when they disconnect. Loom stores only Spotify IDs, Triage decisions, and what Sources return. Names and cover art are fetched from Spotify each time they're shown, behind a short-lived cache. The code will look like it refetches data needlessly. That's deliberate: don't "optimize" by saving Spotify metadata to the database.
