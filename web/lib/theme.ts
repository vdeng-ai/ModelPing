// 主题偏好：dark / light / system。
// 偏好存 localStorage；解析后的实际主题写到 <html data-theme>。
// system 模式跟随系统并监听变化。

export type ThemePref = "dark" | "light" | "system";

const KEY = "llm-test:theme";
const mql = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "dark" || v === "light" || v === "system" ? v : "system";
}

// 把偏好解析为实际主题（dark/light）。
function resolve(pref: ThemePref): "dark" | "light" {
  if (pref === "system") return mql?.matches ? "dark" : "light";
  return pref;
}

// 应用主题到 <html data-theme>。
function apply(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolve(pref);
}

// 设置偏好并立即生效。
export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  apply(pref);
}

// 初始化：应用当前偏好，并在 system 模式下监听系统切换。
// 返回当前偏好，供 UI 初始化状态。
export function initTheme(onSystemChange?: () => void): ThemePref {
  const pref = getThemePref();
  apply(pref);
  if (mql) {
    mql.addEventListener("change", () => {
      if (getThemePref() === "system") {
        apply("system");
        onSystemChange?.();
      }
    });
  }
  return pref;
}
