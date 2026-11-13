import { assertInputSize, assertUnicode, convertRot, convertUrl, decodeBase32, decodeBase64, decodeHex, decodeHtml, decodeMorse, decodeUnicode, encodeBase32, encodeBase64, encodeHex, encodeHtml, encodeMorse, encodeUnicode, isProbablyBase64 } from "./codecs.js";
import { hashText, inspectJwt, signJwt } from "./toolbox-crypto.js";
import { ToolboxError, type ToolboxRequest, type ToolboxResult } from "./toolbox-types.js";

/** Pure, browser-compatible conversions; no network, DOM, storage, or logging. */
export function runToolbox(request: ToolboxRequest): ToolboxResult {
  try {
    const { tool, input, secret, options } = request;
    assertInputSize(input);
    assertInputSize(secret);
    assertUnicode(input);
    const direction = tool === "quick-base64" && request.direction === "auto"
      ? (isProbablyBase64(input) ? "decode" : "encode")
      : request.direction === "decode" ? "decode" : "encode";
    if (input === "" && tool !== "hash") return { ok: true, output: "", direction };
    const encode = direction === "encode";
    let output: string;
    switch (tool) {
      case "quick-base64":
      case "base64":
        output = encode ? encodeBase64(input, options.base64UrlSafe, options.base64Padding) : decodeBase64(input);
        break;
      case "hex":
        output = encode ? encodeHex(input, options.hexUppercase, { none: "", space: " ", colon: ":" }[options.hexSeparator]) : decodeHex(input);
        break;
      case "url": output = convertUrl(input, encode, options.urlMode); break;
      case "base32": output = encode ? encodeBase32(input, options.base32Padding) : decodeBase32(input); break;
      case "unicode": output = encode ? encodeUnicode(input, options.unicodeMode) : decodeUnicode(input); break;
      case "html": output = encode ? encodeHtml(input, options.htmlMode) : decodeHtml(input); break;
      case "rot": output = convertRot(input, options.rotMode); break;
      case "morse": output = encode ? encodeMorse(input) : decodeMorse(input); break;
      case "jwt": {
        if (encode) return { ok: true, output: signJwt(input, secret, options.jwtAlgorithm), direction };
        const { output: decoded, details } = inspectJwt(input, secret, options.jwtAlgorithm);
        return { ok: true, output: decoded, direction, jwt: details };
      }
      case "hash": return { ok: true, output: hashText(input, options.hashAlgorithm, options.hashFormat, options.hashUppercase), direction: "hash" };
    }
    return { ok: true, output, direction };
  } catch (error) {
    return error instanceof ToolboxError
      ? { ok: false, error: error.code, params: error.params }
      : { ok: false, error: "conversionFailed" };
  }
}
