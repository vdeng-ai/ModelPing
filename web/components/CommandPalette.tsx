import { useId, useState } from "preact/hooks";
import { ArrowUpRight, Search, X } from "lucide-preact";
import { Modal } from "./Modal.js";
import { NAV_ITEMS } from "./AppNavigation.js";
import { useI18n } from "../lib/i18n.js";
import type { AppRoute } from "../lib/navigation.js";

export function CommandPalette({ onClose, navigate }: { onClose: () => void; navigate: (route: AppRoute) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const items = NAV_ITEMS.filter((item) =>
    `${t(item.label)} ${item.route}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const choose = (route: AppRoute) => {
    onClose();
    navigate(route);
  };
  return (
    <Modal className="command-palette" labelledBy={`${id}-title`} onClose={onClose}>
      <div class="modal-head">
        <h2 id={`${id}-title`}>{t("workbench.quickJump")}</h2>
        <button class="icon-button subtle" aria-label={t("common.close")} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <label class="search-control command-search">
        <Search size={20} aria-hidden="true" />
        <input
          data-autofocus="true"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-activedescendant={items[active] ? `${id}-option-${active}` : undefined}
          aria-label={t("workbench.searchPages")}
          placeholder={t("workbench.searchPages")}
          value={query}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.isComposing) return;
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
              event.preventDefault();
              setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
            }
            if (event.key === "Enter" && items[active]) {
              event.preventDefault();
              choose(items[active].route);
            }
          }}
        />
      </label>
      <div id={`${id}-results`} role="listbox" aria-label={t("workbench.quickJump")} class="command-results">
        {items.map(({ route, label, icon: Icon }, index) => (
          <button
            key={route}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === active}
            tabIndex={-1}
            class={index === active ? "command-option active" : "command-option"}
            onClick={() => choose(route)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{t(label)}</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {!items.length ? <p class="empty">{t("ui.noMatch")}</p> : null}
      <div class="command-footer">
        <span>
          <kbd>↑ ↓</kbd> {t("workbench.choose")} <kbd>Enter</kbd> {t("workbench.open")}
        </span>
        <span>{t("workbench.noRequests")}</span>
      </div>
    </Modal>
  );
}
