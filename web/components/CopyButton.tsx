import { useState } from "preact/hooks";
import { copy } from "../lib/format.js";
import { useI18n } from "../lib/i18n.js";

// 复制按钮：点击复制 value，短暂显示 ✓。可选 title。
export function CopyButton({ value, title }: { value: string; title?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      class="icon"
      title={title ?? t("common.copy")}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copy(value);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1100);
        }
      }}
    >
      {done ? "✓" : t("common.copy")}
    </button>
  );
}
