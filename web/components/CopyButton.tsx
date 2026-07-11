import { useState } from "preact/hooks";
import { copy } from "../lib/format.js";
import { useI18n } from "../lib/i18n.js";

// 复制按钮：点击复制 value，短暂显示 ✓；失败显示失败文案。
export function CopyButton({ value, title }: { value: string; title?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  if (!value) return null;
  return (
    <button
      class="icon"
      title={title ?? t("common.copy")}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copy(value);
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1100);
      }}
    >
      {state === "ok" ? "✓" : state === "fail" ? t("common.copyFailed") : t("common.copy")}
    </button>
  );
}
