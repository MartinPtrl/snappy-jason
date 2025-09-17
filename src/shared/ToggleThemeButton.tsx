import { useState, useEffect, useCallback } from "react";

// Detect OS theme preference
const getOSTheme = (): "light" | "dark" => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark"; // fallback
};

export function ToggleThemeButton() {
  const [theme, setTheme] = useState<"light" | "dark">(getOSTheme);

  const toggleTheme = useCallback(
    () => setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light")),
    []
  );

  // apply theme to body, which is used in CSS
  useEffect(() => document.body.setAttribute("data-theme", theme), [theme]);

  // Listen for OS theme changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleThemeChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleThemeChange);

      return () => mediaQuery.removeEventListener("change", handleThemeChange);
    }
  }, []);

  return (
    <button 
      onClick={toggleTheme} 
      className="theme-toggle-button"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
