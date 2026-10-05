import { useState } from "preact/hooks";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-preact";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";
import { useI18n } from "../lib/i18n.js";
import { GlassButton, GlassSegmentedControl } from "./design-system/GlassControls.js";

import { useMediaQuery } from "./useMediaQuery.js";
import { ActionMenu } from "./ActionMenu.js";

// 三段式主题按钮组：白天 / 暗黑 / 跟随系统。点击某段即切到该偏好。
const SEGS: { pref: ThemePref; icon: LucideIcon; key: string }[] = [
  { pref: "light", icon: Sun, key: "theme.light" },
  { pref: "dark", icon: Moon, key: "theme.dark" },
  { pref: "system", icon: Monitor, key: "theme.system" },
];

export function ThemeToggle() {
  const { t } = useI18n();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [pref, setPref] = useState<ThemePref>(getThemePref());

  const pick = (p: ThemePref) => {
    setThemePref(p);
    setPref(p);
  };

  if (mobile) return <ActionMenu label={t("theme.label")}>{SEGS.map((s) => { const Icon = s.icon; return <button key={s.pref} type="button" aria-pressed={pref === s.pref} onClick={() => pick(s.pref)}><Icon size={16} aria-hidden="true" />{t(s.key)}</button>; })}</ActionMenu>;
  return (
    <GlassSegmentedControl class="theme-toggle" role="group" aria-label={t("theme.label")}>
      {SEGS.map((s) => {
        const Icon = s.icon;
        const active = pref === s.pref;
        return <GlassButton
          class="seg"
          active={active}
          aria-pressed={active}
          aria-label={t(s.key)}
          title={t("theme.titlePrefix", { name: t(s.key) })}
          onClick={() => pick(s.pref)}
        >
          <Icon class="seg-icon" size={15} aria-hidden="true" />
          <span class="seg-label">{t(s.key)}</span>
        </GlassButton>;
      })}
    </GlassSegmentedControl>
  );
}
