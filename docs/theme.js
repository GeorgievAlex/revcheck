// Dark is the default. A viewer's explicit choice is remembered in this
// browser only. The inline script in each page's <head> applies a stored
// choice before first paint; this module wires the header toggle.
export const STORAGE_KEY = "koyakola-theme";

export function resolveTheme(stored) {
  return stored === "light" ? "light" : "dark";
}

export function otherTheme(theme) {
  return theme === "light" ? "dark" : "light";
}

function label(button, theme) {
  const next = otherTheme(theme);
  button.textContent = next === "light" ? "☀ Light" : "☾ Dark";
  button.setAttribute("aria-label", `Switch to ${next} theme`);
}

export function initThemeToggle(button) {
  const root = document.documentElement;
  label(button, resolveTheme(root.dataset.theme));
  button.addEventListener("click", () => {
    const theme = otherTheme(resolveTheme(root.dataset.theme));
    root.dataset.theme = theme;
    label(button, theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this page view.
    }
  });
}

if (typeof document !== "undefined") {
  const button = document.getElementById("theme-toggle");
  if (button) initThemeToggle(button);
}
