import type { Direction, ToolId, ToolboxOptions } from "./toolbox-types.js";

// Public demo credentials only. Never read from the API testing connection.
export const DEMO_JWT_SECRET = "modelping-demo-secret-0123456789-".repeat(3);
const DEMO_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vIiwibmFtZSI6Ik1vZGVsUGluZyIsIm1lc3NhZ2UiOiLkvaDlpb0g8J-RiyJ9.AjKR5WsHKtUbKDStghKOYVVqv96EgXjAXfUjIZzj7Q4";

export function toolboxExample(tool: ToolId, direction: Direction, options: ToolboxOptions): { input: string; secret?: string } {
  if (tool === "jwt") {
    return {
      input: direction === "encode" ? JSON.stringify({ header: { alg: options.jwtAlgorithm, typ: "JWT" }, payload: { sub: "demo", name: "ModelPing", message: "你好 👋" } }, null, 2) : DEMO_JWT,
      secret: DEMO_JWT_SECRET,
    };
  }
  const decodeExamples: Record<Exclude<ToolId, "jwt">, string> = {
    "quick-base64": "SGVsbG8sIE1vZGVsUGluZyE=",
    base64: "SGVsbG8sIE1vZGVsUGluZyE=",
    hex: "e4 bd a0 e5 a5 bd 20 f0 9f 91 8b",
    url: "Hello%20ModelPing%21%20%E4%BD%A0%E5%A5%BD",
    base32: "MZXW6YTBOI======",
    unicode: "\\u4f60\\u597d \\ud83d\\udc4b",
    html: "&lt;div title=&quot;ModelPing&quot;&gt;你好 &amp; &#128075;&lt;/div&gt;",
    rot: "Uryyb, ZbqryCvat! 123",
    morse: "... --- ... / .... . .-.. .--.",
    hash: "Hello, ModelPing!",
  };
  if (direction === "decode" || (tool === "quick-base64" && direction === "auto")) return { input: decodeExamples[tool] };
  if (tool === "morse") return { input: "Hello World! 123" };
  if (tool === "rot") return { input: "Hello, ModelPing! 123" };
  if (tool === "html") return { input: '<div title="ModelPing">你好 & 👋</div>' };
  if (tool === "url") return { input: options.urlMode === "uri" ? "https://example.com/你好?q=hello world&lang=中文" : "Hello ModelPing! 你好 + 👋" };
  return { input: "Hello, ModelPing! 你好 👋" };
}
