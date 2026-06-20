import { useStore, type PageTheme } from "../../state/store";
import { IconDark, IconLight, IconSystem } from "../icons";

const THEMES: Array<{ value: PageTheme; label: string; Icon: () => JSX.Element }> = [
  { value: "system", label: "System theme", Icon: IconSystem },
  { value: "light", label: "Light theme", Icon: IconLight },
  { value: "dark", label: "Dark theme", Icon: IconDark },
];

export function Topbar() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/assets/tinted-theming-logo.png" alt="Tinted Theming" />
        <div className="brand-text">
          <h1>Tinted Studio</h1>
          <p className="brand-tagline">Build &amp; export a color scheme</p>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="theme-switcher" role="group" aria-label="Page theme">
          {THEMES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              className={"icon-button" + (theme === value ? " active" : "")}
              title={label}
              aria-label={label}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
