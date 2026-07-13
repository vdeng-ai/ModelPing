const displayTextCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

/** Return a sorted copy without changing the source array. */
export function sortByDisplayText<T>(
  items: readonly T[],
  getText: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => displayTextCollator.compare(getText(a), getText(b)));
}
