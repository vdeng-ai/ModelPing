import { useI18n, type Lang } from "../lib/i18n.js";
import { Languages } from "lucide-preact";
import { GlassButton, GlassSegmentedControl } from "./design-system/GlassControls.js";

// 双段式语言按钮组：EN / 中。点击即切到该语言。
const SEGS: { lang: Lang; key: string }[] = [
  { lang: "en", key: "lang.en" },
  { lang: "zh", key: "lang.zh" },
];

export function LangToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <GlassSegmentedControl class="theme-toggle lang-toggle" role="group" aria-label={t("lang.label")}>
      <Languages size={15} aria-hidden="true" />
      {SEGS.map((s) => {
        const active = lang === s.lang;
        return (
          <GlassButton
            class="seg"
            active={active}
            aria-pressed={active}
            onClick={() => setLang(s.lang)}
          >
            {t(s.key)}
          </GlassButton>
        );
      })}
    </GlassSegmentedControl>
  );
}
