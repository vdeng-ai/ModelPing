import { useState } from "preact/hooks";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";

// 三段式主题按钮组：白天 / 暗黑 / 跟随系统。点击某段即切到该偏好。
const SEGS: { pref: ThemePref; icon: string; text: string }[] = [
  { pref: "light", icon: "☀", text: "白天" },
  { pref: "dark", icon: "🌙", text: "暗黑" },
  { pref: "system", icon: "🖥", text: "系统" },
];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getThemePref());

  const pick = (p: ThemePref) => {
    setThemePref(p);
    setPref(p);
  };

  return (
    <div class="theme-toggle" role="group" aria-label="主题">
      {SEGS.map((s) => (
        <button
          class={"seg" + (pref === s.pref ? " active" : "")}
          title={`主题：${s.text}`}
          onClick={() => pick(s.pref)}
        >
          <span class="seg-icon">{s.icon}</span> {s.text}
        </button>
      ))}
    </div>
  );
}
