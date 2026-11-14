export type Density = "comfortable" | "compact";
const KEY = "modelping:ui-density";

export function readDensity(): Density {
  try {
    return localStorage.getItem(KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function writeDensity(value: Density) {
  // Browser-only preference. Storage-denied browsing still supports the current view.
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* Keep the in-memory choice. */
  }
}
