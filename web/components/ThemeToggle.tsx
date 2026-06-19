import { useState } from "preact/hooks";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";
import { useI18n } from "../lib/i18n.js";

// 三段式主题按钮组：白天 / 暗黑 / 跟随系统。点击某段即切到该偏好。
const SEGS: { pref: ThemePref; icon: string; key: string }[] = [
  { pref: "light", icon: "☀", key: "theme.light" },
  { pref: "dark", icon: "🌙", key: "theme.dark" },
  { pref: "system", icon: "🖥", key: "theme.system" },
];

export function ThemeToggle() {
  const { t } = useI18n();
  const [pref, setPref] = useState<ThemePref>(getThemePref());

  const pick = (p: ThemePref) => {
    setThemePref(p);
    setPref(p);
  };

  return (
    <div class="theme-toggle" role="group" aria-label={t("theme.label")}>
      {SEGS.map((s) => (
        <button
          class={"seg" + (pref === s.pref ? " active" : "")}
          title={t("theme.titlePrefix", { name: t(s.key) })}
          onClick={() => pick(s.pref)}
        >
          <span class="seg-icon">{s.icon}</span> {t(s.key)}
        </button>
      ))}
    </div>
  );
}
