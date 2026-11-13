import { DEFAULT_TOOLBOX_OPTIONS, TOOL_IDS, type Direction, type ToolboxOptions, type ToolId } from "./toolbox-types.js";

export const TOOLBOX_PREFERENCES_KEY = "modelping:toolbox:preferences:v1";

export interface ToolboxPreferences {
  tool: ToolId;
  directions: Record<ToolId, Direction>;
  options: ToolboxOptions;
}

const CHOICES: Partial<Record<keyof ToolboxOptions, readonly string[]>> = {
  hexSeparator: ["none", "space", "colon"], urlMode: ["component", "uri", "form"], unicodeMode: ["utf16", "codepoint"],
  htmlMode: ["named", "decimal", "hex"], rotMode: ["13", "5", "18", "47"],
  hashAlgorithm: ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"], hashFormat: ["hex", "base64"], jwtAlgorithm: ["HS256", "HS384", "HS512"],
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Whitelist on both read AND write: never serialize drafts, tokens, results, or secrets. */
export function sanitizeToolboxPreferences(value: unknown): ToolboxPreferences {
  const source = record(value);
  const directions = record(source.directions);
  const options = record(source.options);
  const safeOptions = { ...DEFAULT_TOOLBOX_OPTIONS };
  for (const key of Object.keys(DEFAULT_TOOLBOX_OPTIONS) as (keyof ToolboxOptions)[]) {
    const candidate = options[key];
    if (typeof DEFAULT_TOOLBOX_OPTIONS[key] === "boolean" ? typeof candidate === "boolean" : CHOICES[key]?.includes(candidate as string)) {
      Object.assign(safeOptions, { [key]: candidate });
    }
  }
  return {
    tool: TOOL_IDS.includes(source.tool as ToolId) ? source.tool as ToolId : "quick-base64",
    directions: Object.fromEntries(TOOL_IDS.map((tool) => {
      const candidate = directions[tool];
      const fallback = tool === "quick-base64" ? "auto" : tool === "jwt" ? "decode" : "encode";
      return [tool, candidate === "encode" || candidate === "decode" || (tool === "quick-base64" && candidate === "auto") ? candidate : fallback];
    })) as Record<ToolId, Direction>,
    options: safeOptions,
  };
}

export function loadToolboxPreferences(): ToolboxPreferences {
  try { return sanitizeToolboxPreferences(JSON.parse(localStorage.getItem(TOOLBOX_PREFERENCES_KEY) ?? "null")); }
  catch { return sanitizeToolboxPreferences(null); }
}

export function saveToolboxPreferences(preferences: ToolboxPreferences): boolean {
  try {
    localStorage.setItem(TOOLBOX_PREFERENCES_KEY, JSON.stringify(sanitizeToolboxPreferences(preferences)));
    return true;
  } catch { return false; }
}
