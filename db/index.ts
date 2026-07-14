export type DatabaseRuntime = {
  kind: "browser-local";
  durable: true;
  scope: "this-browser";
};

/**
 * The Vercel MVP is deliberately local-first until a managed database is
 * provisioned. This makes the persistence boundary explicit instead of
 * pretending a Cloudflare D1 binding exists in a different runtime.
 */
export function getDatabaseRuntime(): DatabaseRuntime {
  return {
    kind: "browser-local",
    durable: true,
    scope: "this-browser",
  };
}
