export type AppRoute = "test-models" | "test-history" | "status" | "providers";

export const DEFAULT_APP_ROUTE: AppRoute = "test-models";

const HASH_BY_ROUTE: Record<AppRoute, string> = {
  "test-models": "#test/models",
  "test-history": "#test/history",
  status: "#status",
  providers: "#providers",
};

export function appRouteFromHash(hash: string): AppRoute {
  const normalized = hash.trim().toLowerCase().replace(/\/+$/, "");
  if (normalized === "#test/history") return "test-history";
  if (normalized === "#status") return "status";
  if (normalized === "#providers" || normalized === "#settings") return "providers";
  return DEFAULT_APP_ROUTE;
}

export function hashForAppRoute(route: AppRoute): string {
  return HASH_BY_ROUTE[route];
}
