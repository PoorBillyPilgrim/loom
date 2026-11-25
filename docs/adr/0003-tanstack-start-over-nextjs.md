# TanStack Start over Next.js

Loom is built on TanStack Start. Its data model is TanStack Query and Router, which the author already uses daily, it has typed routes and search params, and server functions keep OAuth and API secrets on the server. It also deploys anywhere Vite runs. We accept a younger framework with a smaller ecosystem and fewer authentication examples than Next.js.

## Considered Options

- **Next.js**: more mature and better documented. Rejected because its React Server Components and caching model would sit alongside TanStack Query as a second, overlapping way of fetching data, and it works best on Vercel.
