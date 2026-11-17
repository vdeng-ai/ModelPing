import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BrandLogo, BRAND_LOGO_URL } from "../components/BrandLogo.js";

describe("shared brand identity", () => {
  it("uses the same versioned asset for the browser icon and page logo", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const icon = html.match(/<link\b[^>]*rel="icon"[^>]*>/)?.[0];
    expect(icon).toContain(`href="${BRAND_LOGO_URL}"`);
    expect(icon).toContain('type="image/svg+xml"');
    expect(icon).toContain('sizes="any"');
    expect(BRAND_LOGO_URL).not.toContain("workbench-3");
    expect(BrandLogo({}).props.src).toBe(BRAND_LOGO_URL);
  });

  it("reserves a square footprint and keeps the decorative mark out of the accessible name", () => {
    const mark = BrandLogo({ className: "pw-gate-logo" });
    expect(mark.type).toBe("img");
    expect(mark.props).toMatchObject({
      class: "brand-logo pw-gate-logo",
      width: 38,
      height: 38,
      alt: "",
      "aria-hidden": "true",
    });
  });

  it("keeps the purple/white artwork self-contained and independent of theme", () => {
    const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
    expect(svg).toContain('viewBox="0 0 38 38"');
    expect(svg).toContain('rx="11" fill="#5b4bdb"');
    expect(svg).toContain('stroke="#fff" stroke-width="2.2"');
    expect(svg).not.toMatch(/<script\b|<image\b|<foreignObject\b|@media|currentColor|#086b60/);
  });
});
