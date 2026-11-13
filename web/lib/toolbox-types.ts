export const TOOL_IDS = ["quick-base64", "base64", "hex", "url", "base32", "unicode", "html", "rot", "morse", "jwt", "hash"] as const;
export type ToolId = typeof TOOL_IDS[number];
export type Direction = "auto" | "encode" | "decode";
export type HashAlgorithm = "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
export type JwtAlgorithm = "HS256" | "HS384" | "HS512";

// Bound both memory use and accidental multi-megabyte pastes. UTF-16 code units.
export const MAX_TOOLBOX_INPUT = 1_000_000;

export interface ToolboxOptions {
  base64UrlSafe: boolean;
  base64Padding: boolean;
  hexUppercase: boolean;
  hexSeparator: "none" | "space" | "colon";
  urlMode: "component" | "uri" | "form";
  base32Padding: boolean;
  unicodeMode: "utf16" | "codepoint";
  htmlMode: "named" | "decimal" | "hex";
  rotMode: "13" | "5" | "18" | "47";
  hashAlgorithm: HashAlgorithm;
  hashFormat: "hex" | "base64";
  hashUppercase: boolean;
  jwtAlgorithm: JwtAlgorithm;
}

export const DEFAULT_TOOLBOX_OPTIONS: ToolboxOptions = {
  base64UrlSafe: false,
  base64Padding: true,
  hexUppercase: false,
  hexSeparator: "space",
  urlMode: "component",
  base32Padding: true,
  unicodeMode: "utf16",
  htmlMode: "named",
  rotMode: "13",
  hashAlgorithm: "SHA-256",
  hashFormat: "hex",
  hashUppercase: false,
  jwtAlgorithm: "HS256",
};

export interface ToolboxRequest {
  tool: ToolId;
  direction: Direction;
  input: string;
  options: ToolboxOptions;
  secret: string;
}

export type ToolboxErrorCode =
  | "tooLarge" | "invalidBase64" | "invalidBase32" | "invalidHex"
  | "invalidUtf8" | "invalidUnicode" | "invalidUrl" | "invalidMorse"
  | "unsupportedMorse" | "invalidJwt" | "invalidJson" | "jwtObjects"
  | "jwtAlgorithm" | "jwtExtension" | "secretRequired" | "weakSecret"
  | "conversionFailed";

export class ToolboxError extends Error {
  constructor(public readonly code: ToolboxErrorCode, public readonly params?: Record<string, string | number>) {
    super(code);
    this.name = "ToolboxError";
  }
}

export interface JwtDetails {
  algorithm: string;
  verification: "unchecked" | "valid" | "invalid" | "unsigned" | "unsupported" | "mismatch";
  weakSecret: boolean;
  claims: "unchecked" | "expired" | "notYetValid" | "invalid";
  expiresAt?: number;
  notBefore?: number;
}

export type ToolboxResult = {
  ok: true;
  output: string;
  direction: "encode" | "decode" | "hash";
  jwt?: JwtDetails;
} | {
  ok: false;
  error: ToolboxErrorCode;
  params?: Record<string, string | number>;
};

export interface ToolboxWorkerRequest { id: number; request: ToolboxRequest }
export interface ToolboxWorkerResponse { id: number; result: ToolboxResult }
