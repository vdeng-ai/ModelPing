import { useEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "../lib/i18n.js";
import { useModalA11y } from "./useModalA11y.js";

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  mono?: boolean;
}

interface Props {
  title: string;
  fields: PromptField[];
  confirmLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  onClose: () => void;
}

// 通用轻量弹层：1～N 个文本字段，用于「+状态」填供应商名、「添加到供应商」等。
export function PromptModal({ title, fields, confirmLabel, onConfirm, onClose }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.defaultValue ?? "";
    return init;
  });
  const firstRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "prompt-modal-title";

  useModalA11y(onClose, dialogRef);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  const missingRequired = fields.some((f) => f.required && !values[f.key]?.trim());

  const submit = () => {
    if (missingRequired) return;
    const cleaned: Record<string, string> = {};
    for (const f of fields) cleaned[f.key] = (values[f.key] ?? "").trim();
    onConfirm(cleaned);
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        class="modal modal-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button class="icon" title={t("common.close")} onClick={onClose}>×</button>
        </div>
        <div class="modal-prompt-fields">
          {fields.map((f, i) => (
            <div key={f.key} class="field">
              <label>{f.label}</label>
              <input
                ref={i === 0 ? firstRef : undefined}
                class={f.mono ? "mono" : undefined}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                data-autofocus={i === 0 ? "true" : undefined}
                onInput={(e) => setValues((prev) => ({ ...prev, [f.key]: (e.target as HTMLInputElement).value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div class="modal-actions">
          <span class="spacer" />
          <button onClick={onClose}>{t("common.cancel")}</button>
          <button class="primary" disabled={missingRequired} onClick={submit}>
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
