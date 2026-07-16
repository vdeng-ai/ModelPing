import { useState } from "preact/hooks";
import { Check, CircleAlert, Copy } from "lucide-preact";
import { copy } from "../lib/format.js";
import { useI18n } from "../lib/i18n.js";

// 复制按钮：点击复制 value，短暂显示 ✓；失败显示失败文案。
export function CopyButton({ value, title }: { value: string; title?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  if (!value) return null;
  const label = state === "fail" ? t("common.copyFailed") : title ?? t("common.copy");
  return (
    <button
      type="button"
      class={"icon-button subtle copy-button " + state}
      title={label}
      aria-label={label}
      aria-live="polite"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copy(value);
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1100);
      }}
    >
      {state === "ok" ? <Check size={15} aria-hidden="true" /> : state === "fail" ? <CircleAlert size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
    </button>
  );
}
