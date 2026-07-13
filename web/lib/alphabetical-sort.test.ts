import { describe, expect, it } from "vitest";
import { sortByDisplayText } from "./alphabetical-sort.js";

describe("sortByDisplayText", () => {
  it("sorts visible names case-insensitively with natural numeric order", () => {
    const items = [
      { name: "model-10" },
      { name: "Zulu" },
      { name: "model-2" },
      { name: "alpha" },
      { name: "智谱 GLM" },
    ];

    expect(sortByDisplayText(items, (item) => item.name).map((item) => item.name)).toEqual([
      "alpha",
      "model-2",
      "model-10",
      "Zulu",
      "智谱 GLM",
    ]);
  });

  it("places newly appended entries at their alphabetical position without mutating the source", () => {
    const items = [{ name: "Zulu" }, { name: "Alpha" }];
    const withNewEntry = [...items, { name: "Beta" }];

    const sorted = sortByDisplayText(withNewEntry, (item) => item.name);

    expect(sorted.map((item) => item.name)).toEqual(["Alpha", "Beta", "Zulu"]);
    expect(withNewEntry.map((item) => item.name)).toEqual(["Zulu", "Alpha", "Beta"]);
  });
});
