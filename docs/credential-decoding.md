# Credential decoding reference

[Documentation](./README.md) · [简体中文](./credential-decoding.zh-CN.md)

The **Credential decoding** panel is part of **Test**, not a separate navigation page. Select a tool, enter text, and choose a direction when automatic detection is ambiguous. For a decoded API key or URL, use the transfer button to fill the connection form; this does not start a test. Decode the individual value, not an entire JSON configuration object.

| Tool         | Supported features                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Quick Base64 | Automatically decode Base64 that produces readable UTF-8, or select a direction explicitly                                          |
| Base64       | UTF-8, standard Base64 / Base64URL and optional `=` padding                                                                         |
| Hex          | UTF-8 hexadecimal, letter case and none/space/colon separators; decode `0x` prefixes and common byte separators                     |
| URL          | Component, full URL and form-component modes (space / `+` conversion)                                                               |
| Base32       | RFC 4648, including omitted padding, lowercase input and unused-bit validation                                                      |
| Unicode      | `\uXXXX`, `\u{…}`, `\xXX` and common escapes, including multilingual text, emoji and surrogate validation                           |
| HTML         | HTML5 entity decoding, special-character escaping and decimal/hex entities for all characters                                       |
| ROT          | ROT13, ROT5, ROT18 and ROT47                                                                                                        |
| Morse        | Latin letters, digits and common punctuation; spaces separate characters, `/` separates words, line breaks are preserved            |
| JWT          | Inspect Header / Payload, sign and verify HS256 / HS384 / HS512 with an explicitly selected algorithm, display `exp` / `nbf` status |
| Hash         | MD5, SHA-1, SHA-256, SHA-384 and SHA-512; hexadecimal or Base64 digests, including empty-string hashing                             |

Conversion stays in the browser, using a Web Worker when available and a local fallback otherwise. No conversion API, polling or remote resources are added. Hashing and HMAC do not require Web Crypto, so they also work on local-network HTTP pages. Clipboard access remains subject to browser permissions, with manual copying available on failure.

Only the selected tool, directions and format preferences are saved under `modelping:toolbox:preferences:v1`. Input, output and JWT secrets are never written to localStorage / sessionStorage or synced with ModelPing's private working state. Per-tool drafts stay in memory while the Test page is open and are cleared when leaving the Test page or reloading. Input is limited to 1,000,000 UTF-16 code units; oversized input, invalid alphabets and invalid UTF-8 produce errors instead of silent truncation or replacement.

Limitations: automatic Base64 detection is a heuristic; select an explicit direction for ambiguous text. Morse does not support non-Latin text and decodes to uppercase. Hashes are not reversible; MD5 / SHA-1 are legacy checksums, not security primitives. JWT signing accepts `{"header":{"alg":"HS256","typ":"JWT"},"payload":{"sub":"demo"}}`, with an optional `header`; HS256 / HS384 / HS512 signing keys must contain at least 32 / 48 / 64 UTF-8 bytes respectively. Other JWT signing algorithms can be inspected, but not verified; five-part JWE is not supported. **Decoding does not establish trust, and an HMAC match does not validate issuer, audience or permissions.** Time claims are evaluated at conversion time. This decoder is not a substitute for application authentication.

Once you transfer a value into the connection form, it follows connection-state persistence rules. Actual test, model-list and balance requests are sent through the ModelPing backend. See [privacy and storage](./deployment.md#storage-and-privacy).

Dependency notices: [third-party licenses](../web/public/assets/toolbox-licenses.txt).
