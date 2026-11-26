# loom

## Invites

Only Invited email addresses can sign in. Add one by hand with wrangler:

```sh
npx wrangler d1 execute loom --local --command "INSERT INTO invites (email) VALUES ('friend@example.com')"
```

Use `--remote` instead of `--local` for the deployed database.
