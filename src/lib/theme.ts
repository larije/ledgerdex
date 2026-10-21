export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // The current page can still change theme when browser storage is blocked.
  }
}
