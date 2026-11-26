// Tests call Loom's handlers and core directly, so the test Worker doesn't load TanStack Start's generated server entry
export default {
  fetch: () => new Response("Loom test worker", { status: 404 }),
} satisfies ExportedHandler<Env>;
