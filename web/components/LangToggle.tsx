import { Languages } from "lucide-preact";
import { useI18n, type Lang } from "../lib/i18n.js";
export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <label class="lang-select">
      <Languages size={16} aria-hidden="true" />
      <select aria-label={t("lang.label")} value={lang} onChange={(e) => setLang(e.currentTarget.value as Lang)}>
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
