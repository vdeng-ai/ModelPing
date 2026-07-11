import { useMemo, useRef, useState } from "preact/hooks";
import { useI18n } from "../lib/i18n.js";
import { useModalA11y } from "./useModalA11y.js";

interface Props {
  models: string[];          // 拉取到的模型 id 列表
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

// 模型挑选弹层：搜索过滤 + 多选 + 全选/确定/取消。确定时把选中 id 透传给调用方。
export function ModelPickerModal({ models, onConfirm, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "model-picker-title";

  useModalA11y(onClose, dialogRef);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  }, [models, query]);

  const allFilteredChecked = filtered.length > 0 && filtered.every((m) => selected.has(m));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredChecked) filtered.forEach((m) => next.delete(m));
      else filtered.forEach((m) => next.add(m));
      return next;
    });
  };

  const confirm = () => {
    if (selected.size) onConfirm([...selected]);
    onClose();
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h3 id={titleId}>{t("picker.title", { count: models.length })}</h3>
          <button class="icon" title={t("common.close")} onClick={onClose}>×</button>
        </div>

        <input
          class="mono modal-search"
          placeholder={t("picker.searchPlaceholder")}
          value={query}
          data-autofocus="true"
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />

        <div class="modal-list">
          {filtered.length === 0 ? (
            <div class="empty">{t("picker.noMatch")}</div>
          ) : (
            filtered.map((m) => (
              <label key={m} class="modal-item">
                <input type="checkbox" checked={selected.has(m)} onChange={() => toggle(m)} />
                <span class="mono">{m}</span>
              </label>
            ))
          )}
        </div>

        <div class="modal-actions">
          <button disabled={filtered.length === 0} onClick={toggleAllFiltered}>
            {allFilteredChecked ? t("common.deselectAll") : t("common.selectAll")}
          </button>
          <span class="spacer" />
          <span class="modal-count">{t("picker.selectedCount", { count: selected.size })}</span>
          <button onClick={onClose}>{t("common.cancel")}</button>
          <button class="primary" disabled={selected.size === 0} onClick={confirm}>{t("common.add")}</button>
        </div>
      </div>
    </div>
  );
}
