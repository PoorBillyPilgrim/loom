# Cloudflare Workers, D1, and Cron Triggers

Loom runs on Cloudflare Workers (paid plan, $5/month), stores data in D1 (SQLite), and runs the Digest from a Cron Trigger. The free plan's limits rule it out: 10 ms of CPU per request and 50 outgoing calls per run, while a Digest for five Listeners makes about 500 calls. With up to 25 Listeners (0006) that grows to about 2,500, and MusicBrainz allows 1 request per second, so MBID lookups are cached. Workers run on Cloudflare's own runtime (workerd), not Node.js, so libraries that need native add-ons or `child_process` won't work.

To keep a later move to Postgres simple:

- Declare column meaning with Drizzle's typed modes, e.g. `integer({ mode: 'boolean' })` and `integer({ mode: 'timestamp' })`.
- Use text IDs (Spotify IDs, or UUIDs for Loom's own records), not SQLite auto-increment.
- No raw SQLite-specific SQL; go through the query builder.

## Considered Options

- **AWS via SST (Lambda, CloudFront, EventBridge Scheduler) with Neon Postgres**: nearly free and the skills carry over to work, but far more setup and slow first loads after idle periods. Rejected because the tool matters more than the learning.
- **AWS with DynamoDB**: all AWS, but gives up relational queries and Drizzle.
- **Fly.io or Railway running Node with a SQLite file**: a plain Node runtime, but a server to look after and a scheduled job to set up yourself.
