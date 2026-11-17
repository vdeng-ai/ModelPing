// Validate only public repository documentation, never ignored personal notes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const visible = [
  ...new Set(
    execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean),
  ),
];
const documents = visible.filter(
  (name) => /^README(?:\.zh-CN)?\.md$/.test(name) || (name.startsWith("docs/") && name.endsWith(".md")),
);
const errors = [];
const stripCode = (text) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
const anchors = (text) => {
  const counts = new Map(),
    ids = new Set();
  for (const [, title] of stripCode(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = title
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    ids.add(count ? `${slug}-${count}` : slug);
  }
  for (const [, id] of text.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(id);
  return ids;
};
let links = 0;
for (const name of documents) {
  const path = join(root, name);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    continue;
  } // Tracked documents may have been moved before staging.
  const body = stripCode(text);
  const targets = [...body.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
  targets.push(...[...body.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]));
  for (const url of targets) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;
    links++;
    try {
      const [rawPath, rawFragment] = url.split("#");
      const target = rawPath ? resolve(dirname(path), decodeURIComponent(rawPath.split("?")[0])) : path;
      assert.ok(target === root || target.startsWith(root + sep), "Link leaves the repository");
      const info = await stat(target);
      if (rawFragment && extname(target) === ".md") {
        assert.ok(
          anchors(await readFile(target, "utf8")).has(decodeURIComponent(rawFragment)),
          `Missing anchor #${rawFragment}`,
        );
      }
      if (info.isFile() && relative(root, target).startsWith("docs/")) {
        assert.ok(visible.includes(relative(root, target)), "Target is ignored and would not be published");
      }
    } catch (error) {
      errors.push(`${name}: ${url}: ${error.message}`);
    }
  }
}
const stems = ["workbench", "model-search", "catalog", "parameters", "history", "status", "providers", "mobile"];
for (const lang of ["en", "zh"]) {
  const readme = await readFile(join(root, lang === "en" ? "README.md" : "README.zh-CN.md"), "utf8");
  const references = [
    ...new Set([...readme.matchAll(/docs\/screenshots\/([\w-]+\.png)/g)].map((match) => match[1])),
  ].sort();
  try {
    assert.deepEqual(references, stems.map((stem) => `${stem}-${lang}.png`).sort());
  } catch {
    errors.push(`README ${lang}: missing, extra, or wrong-language screenshot references`);
  }
  for (const stem of stems) {
    const filename = `docs/screenshots/${stem}-${lang}.png`;
    try {
      const png = await readFile(join(root, filename));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Invalid PNG signature");
      assert.equal(png.toString("ascii", 12, 16), "IHDR", "Missing PNG header");
      assert.equal(png.readUInt32BE(16), stem === "mobile" ? 390 : 1440, "Unexpected capture width");
      assert.ok(png.readUInt32BE(20) > 0 && png.length > 1024, "Empty screenshot");
      assert.ok(visible.includes(filename), "Screenshot is ignored");
    } catch (error) {
      errors.push(`${filename}: ${error.message}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Documentation checks passed: ${documents.length} public Markdown paths, ${links} local links, 16 screenshots.`,
  );
