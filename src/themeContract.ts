export const slateThemeFallbacks = {
  canvas: "#070708",
  surface: "#111113",
  "surface-raised": "#171719",
  border: "#454147",
  text: "#f6f3f4",
  "text-muted": "#aaa7ab",
  accent: "#f81b8f",
  "accent-strong": "#ff79b9",
  "accent-warm": "#ffe500",
  "focus-ring": "#ffe500",
  success: "#35c46a",
  warning: "#ffe500",
  danger: "#ff79b9",
  "gradient-start": "#ff0037",
  "gradient-middle": "#f81b8f",
  "gradient-end": "#ffe500",
} as const;

/**
 * Slate-owned meanings that must remain stable when a host changes palette.
 * A yellow star is the persistent, learned signal for a favorite document.
 */
export const slateOwnedSemanticColors = {
  favorite: "#ffe500",
} as const;

export type SlateHostThemeToken = keyof typeof slateThemeFallbacks;

export const slateHostThemeVariables = Object.fromEntries(
  Object.entries(slateThemeFallbacks).map(([token, fallback]) => [
    token,
    `var(--workshop-${token}, ${fallback})`,
  ]),
) as { [Token in SlateHostThemeToken]: `var(--workshop-${Token}, ${string})` };
