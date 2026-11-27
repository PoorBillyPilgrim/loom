// Tests call the Loom core directly, never server functions, so the request is never needed
export function getRequest(): Request {
  throw new Error("Server functions don't run in tests; call the Loom core");
}
