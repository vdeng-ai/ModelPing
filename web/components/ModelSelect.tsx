import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { Check, ChevronDown, Search } from "lucide-preact";
import { useI18n } from "../lib/i18n.js";
import type { ModelRow } from "../lib/model-rows.js";
import { buildModelOptions, searchModelOptions, type ModelOption } from "../lib/model-selection.js";
import type { ModelCatalogState } from "./useModelCatalog.js";
import "./ModelSelect.css";

export function ModelSelect({ rows, providerId, selectedKey, disabled, catalog, onSelect }: {
  rows: ModelRow[];
  providerId: string;
  selectedKey: string;
  disabled: boolean;
  catalog: ModelCatalogState;
  onSelect: (option: ModelOption) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const allOptions = useMemo(() => buildModelOptions(rows, providerId, catalog.data?.providers ?? []), [rows, providerId, catalog.data]);
  const matches = useMemo(() => searchModelOptions(allOptions, query), [allOptions, query]);
  const selected = rows.find((row) => row.key === selectedKey);
  const activeOption = matches.options[active];
  const expand = () => {
    if (disabled || open) return;
    setOpen(true); setQuery(""); setActive(-1);
    void catalog.load();
  };
  const choose = (option: ModelOption) => {
    onSelect(option);
    setOpen(false); setQuery(""); setActive(-1);
    input.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  return (
    <div class="model-select" onFocusOut={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label class="sr-only" for={id}>{t("workbench.chooseModel")}</label>
      <div class="model-select-input">
        <Search size={17} aria-hidden="true" />
        <input ref={input} id={id} role="combobox" type="text" autocomplete="off" spellcheck={false}
          aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-hint`} disabled={disabled}
          placeholder={t("modelSelect.search")}
          value={open ? query : selected?.label ?? ""}
          onFocus={expand} onClick={expand}
          onInput={(event) => { setQuery(event.currentTarget.value); setOpen(true); setActive(-1); }}
          onKeyDown={(event) => {
            if (event.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) { expand(); setActive(event.key === "ArrowDown" ? 0 : matches.options.length - 1); }
              else setActive((index) => event.key === "ArrowDown" ? Math.min(index + 1, matches.options.length - 1) : Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && activeOption) {
              event.preventDefault(); choose(activeOption);
            } else if (event.key === "Escape" && open) {
              event.preventDefault(); event.stopPropagation(); setOpen(false);
            }
          }} />
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      <p class="model-select-hint" id={`${id}-hint`}>{t("modelSelect.hint")}</p>
      {open ? <div class="model-search-popup">
        <div class="model-search-status" role="status">
          {catalog.loading ? t("modelSelect.loading") : t("modelSelect.matches", { count: matches.total })}
        </div>
        {catalog.error && !catalog.data ? <div class="model-search-error" role="alert">
          <span>{t("modelSelect.loadFailed")} {catalog.error}</span>
          <button type="button" class="text-action" onClick={() => void catalog.load()}>{t("app.retry")}</button>
        </div> : null}
        <div id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={t("workbench.chooseModel")} class="model-search-options" aria-busy={catalog.loading}>
          {matches.options.map((option, index) => <div key={option.id} id={`${id}-option-${index}`}
            role="option" tabIndex={-1} aria-selected={option.rowKey === selectedKey}
            class={`model-search-option${index === active ? " active" : ""}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
            <span class="model-search-identity"><strong>{option.label}</strong><code>{option.id}</code>
              <small>{option.rowKey ? t("modelSelect.configured") : t("catalog.title")}{option.sources.length ? ` · ${option.sources.join(" / ")}` : ""}</small></span>
            {option.rowKey === selectedKey ? <Check size={16} aria-hidden="true" /> : null}
          </div>)}
        </div>
        {!matches.options.length && !catalog.loading ? <p class="model-search-empty">{t("modelSelect.noMatch")}</p> : null}
        {matches.total > matches.options.length ? <p class="model-search-status">{t("modelSelect.refine", { count: matches.options.length })}</p> : null}
        {catalog.data && !catalog.data.providers.length ? <p class="model-search-empty">{t("modelSelect.emptyCatalog")}</p> : null}
      </div> : null}
    </div>
  );
}
