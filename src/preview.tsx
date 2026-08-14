import { createRoot } from "react-dom/client";
import type { CSSProperties } from "react";
import { WorkshopToolView } from "./plugin.js";

const inheritedThemePreview = new URLSearchParams(window.location.search).has("host-theme");
const representativeHostTheme = inheritedThemePreview ? {
  "--workshop-canvas": "#061719",
  "--workshop-surface": "#0b2528",
  "--workshop-surface-raised": "#123439",
  "--workshop-border": "#397078",
  "--workshop-text": "#effffd",
  "--workshop-text-muted": "#9fc5c4",
  "--workshop-accent": "#45d6c5",
  "--workshop-accent-strong": "#78f1df",
  "--workshop-accent-warm": "#ffca6a",
  "--workshop-focus-ring": "#8df7e8",
  "--workshop-success": "#55d98b",
  "--workshop-warning": "#ffca6a",
  "--workshop-danger": "#ff8295",
  "--workshop-gradient-start": "#126b78",
  "--workshop-gradient-middle": "#2faea7",
  "--workshop-gradient-end": "#ffca6a",
  minHeight: "100vh",
} as CSSProperties : undefined;

createRoot(document.getElementById("root")!).render(
  <div style={representativeHostTheme}>
    <WorkshopToolView requestWorkspaceRoot={() => undefined} />
  </div>,
);
