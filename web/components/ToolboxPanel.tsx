import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CircleAlert,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
} from "lucide-preact";
import { copy } from "../lib/format.js";
import { useI18n } from "../lib/i18n.js";
import { toolboxExample } from "../lib/toolbox-examples.js";
import {
  loadToolboxPreferences,
  sanitizeToolboxPreferences,
  saveToolboxPreferences,
} from "../lib/toolbox-preferences.js";
import {
  TOOL_IDS,
  type Direction,
  type ToolId,
  type ToolboxOptions,
  type ToolboxRequest,
} from "../lib/toolbox-types.js";
import { SegmentButton, SegmentedControl } from "./design-system/Controls.js";
import { useToolbox } from "./useToolbox.js";
import "./ToolboxPanel.css";

export default function ToolboxPanel() {
  const { t, lang } = useI18n();
  const [preferences, setPreferences] = useState(loadToolboxPreferences);
  const [canSavePreferences, setCanSavePreferences] = useState(true);
  const [drafts, setDrafts] = useState<Partial<Record<ToolId, string>>>({});
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copySequence = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const { tool, options, directions } = preferences;
  const direction = directions[tool];
  const input = drafts[tool] ?? "";
  const request = useMemo<ToolboxRequest>(
    () => ({ tool, direction, input, options, secret: tool === "jwt" ? secret : "" }),
    [tool, direction, input, options, secret],
  );
  const requestRef = useRef(request);
  requestRef.current = request;
  const { result, pending } = useToolbox(request);
  const output = result?.ok ? result.output : "";
  const error = result && !result.ok ? t(`toolbox.errors.${result.error}`, result.params) : "";
  const jwt = result?.ok ? result.jwt : undefined;

  // These tiny, non-sensitive preferences must survive an immediate reload or
  // route change; a deferred effect can run too late after a tab click.
  useLayoutEffect(() => {
    setCanSavePreferences(saveToolboxPreferences(preferences));
  }, [preferences]);
  useEffect(() => {
    ++copySequence.current;
    setCopyState("idle");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    return () => {
      ++copySequence.current;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [request]);

  const setTool = (next: ToolId) => setPreferences((current) => ({ ...current, tool: next }));
  const setDirection = (next: Direction) =>
    setPreferences((current) => ({ ...current, directions: { ...current.directions, [tool]: next } }));
  const setInput = (value: string) => setDrafts((current) => ({ ...current, [tool]: value }));
  const setOption = (key: keyof ToolboxOptions, value: string | boolean) =>
    setPreferences((current) =>
      sanitizeToolboxPreferences({ ...current, options: { ...current.options, [key]: value } }),
    );

  const onToolKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    const index = TOOL_IDS.indexOf(tool);
    let next: ToolId;
    if (event.key === "ArrowRight") next = TOOL_IDS[(index + 1) % TOOL_IDS.length];
    else if (event.key === "ArrowLeft") next = TOOL_IDS[(index + TOOL_IDS.length - 1) % TOOL_IDS.length];
    else if (event.key === "Home") next = TOOL_IDS[0];
    else if (event.key === "End") next = TOOL_IDS[TOOL_IDS.length - 1];
    else return;
    event.preventDefault();
    setTool(next);
    const tab = document.getElementById(`toolbox-tab-${next}`);
    tab?.focus({ preventScroll: true });
    tab?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  };

  const fillExample = () => {
    const example = toolboxExample(tool, direction, options);
    setInput(example.input);
    if (example.secret !== undefined) {
      setSecret(example.secret);
      if (direction === "decode") setOption("jwtAlgorithm", "HS256");
    }
    inputRef.current?.focus();
  };

  const copyResult = async () => {
    if (!output || pending) return;
    const id = ++copySequence.current;
    const ok = await copy(output);
    if (id !== copySequence.current || requestRef.current !== request) return;
    setCopyState(ok ? "ok" : "fail");
    if (!ok) {
      outputRef.current?.focus();
      outputRef.current?.select();
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  };

  const selectOption = (key: keyof ToolboxOptions, label: string, choices: readonly (readonly [string, string])[]) => (
    <label class="toolbox-option" for={`toolbox-${key}`}>
      <span>{t(`toolbox.${label}`)}</span>
      <select
        id={`toolbox-${key}`}
        value={String(options[key])}
        onChange={(event) => setOption(key, event.currentTarget.value)}
      >
        {choices.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const toggleOption = (key: keyof ToolboxOptions, label: string) => (
    <label class="toolbox-option-toggle">
      <input
        id={`toolbox-${key}`}
        type="checkbox"
        checked={Boolean(options[key])}
        onChange={(event) => setOption(key, event.currentTarget.checked)}
      />
      <span>{t(`toolbox.${label}`)}</span>
    </label>
  );

  const formatControls = (
    <div class="toolbox-options">
      {(tool === "quick-base64" || tool === "base64") && (
        <>
          {toggleOption("base64UrlSafe", "base64UrlSafe")}
          {toggleOption("base64Padding", "padding")}
        </>
      )}
      {tool === "hex" && (
        <>
          {selectOption("hexSeparator", "separator", [
            ["none", t("toolbox.noSeparator")],
            ["space", t("toolbox.spaceSeparator")],
            ["colon", t("toolbox.colonSeparator")],
          ])}
          {toggleOption("hexUppercase", "uppercase")}
        </>
      )}
      {tool === "url" &&
        selectOption("urlMode", "urlMode", [
          ["component", t("toolbox.urlComponent")],
          ["uri", t("toolbox.urlFull")],
          ["form", t("toolbox.urlForm")],
        ])}
      {tool === "base32" && toggleOption("base32Padding", "padding")}
      {tool === "unicode" &&
        selectOption("unicodeMode", "unicodeMode", [
          ["utf16", t("toolbox.unicodeUtf16")],
          ["codepoint", t("toolbox.unicodeCodepoint")],
        ])}
      {tool === "html" &&
        selectOption("htmlMode", "htmlMode", [
          ["named", t("toolbox.htmlNamed")],
          ["decimal", t("toolbox.htmlDecimal")],
          ["hex", t("toolbox.htmlHex")],
        ])}
      {tool === "rot" &&
        selectOption(
          "rotMode",
          "rotMode",
          ["13", "5", "18", "47"].map((value) => [value, `ROT${value}`] as const),
        )}
      {tool === "hash" && (
        <>
          {selectOption(
            "hashAlgorithm",
            "hashAlgorithm",
            ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"].map((value) => [value, value] as const),
          )}
          {selectOption("hashFormat", "hashFormat", [
            ["hex", t("toolbox.hexFormat")],
            ["base64", "Base64"],
          ])}
          {options.hashFormat === "hex" && toggleOption("hashUppercase", "uppercase")}
        </>
      )}
      {tool === "jwt" && (
        <>
          {selectOption(
            "jwtAlgorithm",
            "jwtAlgorithm",
            ["HS256", "HS384", "HS512"].map((value) => [value, value] as const),
          )}
          <div class="toolbox-secret">
            <label for="toolbox-secret">{t("toolbox.secret")}</label>
            <div class="toolbox-secret-control">
              <input
                id="toolbox-secret"
                type={showSecret ? "text" : "password"}
                value={secret}
                autoComplete="off"
                spellcheck={false}
                placeholder={t("toolbox.secretPlaceholder")}
                onInput={(event) => setSecret(event.currentTarget.value)}
              />
              <button
                type="button"
                aria-label={t(showSecret ? "toolbox.hideSecret" : "toolbox.showSecret")}
                aria-pressed={showSecret}
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const formatDate = (value: number) =>
    new Date(value * 1000).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { timeZoneName: "short" });

  return (
    <section class="toolbox-workspace" aria-labelledby="workspace-heading">
      <div class="toolbox-privacy">
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <strong>{t("toolbox.local")}</strong>
          <p>
            {t("toolbox.privacy")}{" "}
            {t(canSavePreferences ? "toolbox.preferencesSaved" : "toolbox.preferencesUnavailable")}
          </p>
        </div>
      </div>

      <SegmentedControl class="toolbox-tabs" role="tablist" aria-label={t("toolbox.tabsLabel")}>
        {TOOL_IDS.map((id) => (
          <SegmentButton
            key={id}
            id={`toolbox-tab-${id}`}
            type="button"
            role="tab"
            active={tool === id}
            aria-selected={tool === id}
            aria-controls="toolbox-panel"
            tabIndex={tool === id ? 0 : -1}
            onClick={() => setTool(id)}
            onKeyDown={onToolKeyDown}
          >
            {t(`toolbox.tools.${id}`)}
          </SegmentButton>
        ))}
      </SegmentedControl>

      <section
        id="toolbox-panel"
        class="panel toolbox-workbench"
        role="tabpanel"
        aria-labelledby={`toolbox-tab-${tool}`}
      >
        <p id="toolbox-help" class="toolbox-help">
          {t(`toolbox.help.${tool}`)}
        </p>
        <div class="toolbox-mode-row">
          {tool !== "hash" && (
            <SegmentedControl class="toolbox-direction" role="group" aria-label={t("toolbox.direction")}>
              {tool === "quick-base64" && (
                <SegmentButton
                  type="button"
                  active={direction === "auto"}
                  aria-pressed={direction === "auto"}
                  onClick={() => setDirection("auto")}
                >
                  <ArrowRightLeft size={17} aria-hidden="true" />
                  {t("toolbox.auto")}
                </SegmentButton>
              )}
              <SegmentButton
                type="button"
                active={direction === "encode"}
                aria-pressed={direction === "encode"}
                onClick={() => setDirection("encode")}
              >
                <ArrowRight size={17} aria-hidden="true" />
                {t(tool === "jwt" ? "toolbox.sign" : "toolbox.encode")}
              </SegmentButton>
              <SegmentButton
                type="button"
                active={direction === "decode"}
                aria-pressed={direction === "decode"}
                onClick={() => setDirection("decode")}
              >
                <ArrowLeft size={17} aria-hidden="true" />
                {t(tool === "jwt" ? "toolbox.parse" : "toolbox.decode")}
              </SegmentButton>
            </SegmentedControl>
          )}
          <span class="toolbox-conversion-state" role="status" aria-live="polite">
            {pending && (input || tool === "hash")
              ? t("toolbox.processing")
              : tool === "quick-base64" && direction === "auto" && input && result?.ok
                ? t(result.direction === "decode" ? "toolbox.autoDecoded" : "toolbox.autoEncoded")
                : ""}
          </span>
        </div>

        {tool === "quick-base64" ? (
          <details class="toolbox-extra">
            <summary>{t("toolbox.formatOptions")}</summary>
            {formatControls}
          </details>
        ) : tool !== "morse" ? (
          formatControls
        ) : null}

        <div class="toolbox-field">
          <label for="toolbox-input">{t("toolbox.input")}</label>
          <textarea
            id="toolbox-input"
            ref={inputRef}
            rows={6}
            value={input}
            spellcheck={false}
            autoComplete="off"
            autocapitalize="off"
            aria-invalid={Boolean(error)}
            aria-describedby={`toolbox-help toolbox-limit${error ? " toolbox-error" : ""}`}
            placeholder={t(
              tool === "jwt"
                ? direction === "decode"
                  ? "toolbox.jwtInputPlaceholder"
                  : "toolbox.jwtJsonPlaceholder"
                : "toolbox.inputPlaceholder",
            )}
            onInput={(event) => setInput(event.currentTarget.value)}
          />
        </div>

        <div class="toolbox-actions">
          <button
            type="button"
            disabled={!output || pending}
            onClick={() => {
              setInput(output);
              inputRef.current?.focus();
            }}
          >
            <ArrowRightLeft size={18} aria-hidden="true" />
            {t("toolbox.moveToInput")}
          </button>
          <button type="button" onClick={fillExample}>
            <Sparkles size={18} aria-hidden="true" />
            {t("toolbox.example")}
          </button>
          <button
            type="button"
            class="subtle"
            disabled={!input && !(tool === "jwt" && secret)}
            onClick={() => {
              setInput("");
              if (tool === "jwt") setSecret("");
              inputRef.current?.focus();
            }}
          >
            <Eraser size={18} aria-hidden="true" />
            {t("toolbox.clear")}
          </button>
        </div>

        {error && (
          <div id="toolbox-error" class="toolbox-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div class="toolbox-field">
          <label for="toolbox-output">{t("toolbox.output")}</label>
          <textarea
            id="toolbox-output"
            ref={outputRef}
            rows={6}
            value={output}
            readOnly
            spellcheck={false}
            aria-busy={pending}
            placeholder={t("toolbox.outputPlaceholder")}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </div>

        {tool === "jwt" && (
          <div class="toolbox-jwt-details">
            {jwt && (
              <>
                <p
                  class={jwt.verification === "valid" ? "toolbox-signature-match" : "toolbox-jwt-warning"}
                  role="status"
                >
                  {t(`toolbox.jwtVerification.${jwt.verification}`)}
                </p>
                {jwt.weakSecret && <p class="toolbox-jwt-warning">{t("toolbox.weakKeyWarning")}</p>}
                {jwt.claims !== "unchecked" && (
                  <p class="toolbox-jwt-warning">{t(`toolbox.jwtClaims.${jwt.claims}`)}</p>
                )}
                {jwt.expiresAt !== undefined && (
                  <p>
                    {t("toolbox.expiresAt")}: {formatDate(jwt.expiresAt)}
                  </p>
                )}
                {jwt.notBefore !== undefined && (
                  <p>
                    {t("toolbox.notBefore")}: {formatDate(jwt.notBefore)}
                  </p>
                )}
              </>
            )}
            <p>{t("toolbox.jwtNotice")}</p>
          </div>
        )}

        <div class="toolbox-footer">
          <p id="toolbox-limit">{t("toolbox.limit")}</p>
          <button
            type="button"
            class="primary toolbox-copy"
            disabled={!output || pending}
            onClick={() => void copyResult()}
          >
            {copyState === "ok" ? (
              <Check size={18} aria-hidden="true" />
            ) : copyState === "fail" ? (
              <CircleAlert size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            <span aria-live="polite">
              {t(copyState === "ok" ? "toolbox.copied" : copyState === "fail" ? "toolbox.copyFailed" : "toolbox.copy")}
            </span>
          </button>
        </div>
      </section>
    </section>
  );
}
