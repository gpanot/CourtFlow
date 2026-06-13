# CourtMap Color Theme

Design tokens for **light** and **dark** themes. Source of truth: `packages/booking-ui/src/lib/theme.ts`.

Use this doc when building the web version, white-label apps, or Figma libraries. Token names match the mobile `ThemeTokens` interface so both platforms stay in sync.

---

## Quick reference

| Token | Role | Dark | Light |
|---|---|---|---|
| `bg` | App background | `#0A0A0A` | `#F8FAFC` |
| `bgCard` | Cards, list rows | `#161616` | `#FFFFFF` |
| `bgSurface` | Panels, elevated surfaces | `#111111` | `#FFFFFF` |
| `bgInput` | Inputs, inactive chips | `#1A1A1A` | `#FFFFFF` |
| `border` | Borders, dividers | `#2A2A2A` | `#E2E8F0` |
| `text` | Primary text | `#F0F0F0` | `#0F172A` |
| `textSec` | Secondary text | `#888888` | `#64748B` |
| `textMuted` | Labels, placeholders | `#555555` | `#64748B` |
| `accent` | Brand, primary CTA | `#B8F200` | `#22C55E` |
| `accentBg` | Accent tint (subtle) | `rgba(184,242,0,0.08)` | `#DCFCE7` |
| `accentBgStrong` | Selected / active tint | `rgba(184,242,0,0.15)` | `rgba(22,163,74,0.15)` |
| `red` | Error, destructive | `#FF4757` | `#EF4444` |
| `orange` | Warning | `#FFA502` | `#EA580C` |
| `green` | Success | `#2ED573` | `#22C55E` |
| `blue` | Info, links | `#3498DB` | `#3B82F6` |
| `pillBg` | Floating pills | `rgba(20,20,20,0.92)` | `rgba(255,255,255,0.95)` |
| `pillBorder` | Pill borders | `#333333` | `#E2E8F0` |
| `sheetBg` | Bottom sheets, modals | `#111111` | `#FFFFFF` |
| `overlay` | Scrim behind sheets | `rgba(0,0,0,0.7)` | `rgba(30,41,59,0.4)` |

---

## Dark theme

Neon-lime accent on near-black backgrounds. Default in the mobile app.

### Backgrounds & surfaces

| Token | Value | Usage |
|---|---|---|
| `bg` | `#0A0A0A` | Page / screen background |
| `bgCard` | `#161616` | Cards, booking rows, profile links |
| `bgSurface` | `#111111` | Nested panels, coach cards |
| `bgInput` | `#1A1A1A` | Text inputs, inactive toggle buttons |
| `sheetBg` | `#111111` | Modal and bottom-sheet background |

### Text

| Token | Value | Usage |
|---|---|---|
| `text` | `#F0F0F0` | Headings, body, icons on dark |
| `textSec` | `#888888` | Descriptions, metadata |
| `textMuted` | `#555555` | Uppercase labels, timestamps |

### Brand & status

| Token | Value | Usage |
|---|---|---|
| `accent` | `#B8F200` | Primary buttons, active nav, highlights |
| `accentBg` | `rgba(184,242,0,0.08)` | Hover / selected row tint |
| `accentBgStrong` | `rgba(184,242,0,0.15)` | Active chip, verified badge bg |
| `red` | `#FF4757` | Errors, cancel, logout |
| `orange` | `#FFA502` | Warnings, pending states |
| `green` | `#2ED573` | Success, confirmed |
| `blue` | `#3498DB` | Info, coach role accent |

### Borders, pills, overlay

| Token | Value | Usage |
|---|---|---|
| `border` | `#2A2A2A` | Card borders, dividers |
| `pillBg` | `rgba(20,20,20,0.92)` | Map pills, floating chips |
| `pillBorder` | `#333333` | Pill outline |
| `overlay` | `rgba(0,0,0,0.7)` | Backdrop behind sheets |

### Shadows

| Token | CSS | Web equivalent |
|---|---|---|
| `shadow` | `0 2px 20px rgba(0,0,0,0.5)` | `box-shadow: 0 2px 20px rgb(0 0 0 / 0.5)` |
| `shadowSm` | `0 1px 8px rgba(0,0,0,0.3)` | `box-shadow: 0 1px 8px rgb(0 0 0 / 0.3)` |

---

## Light theme

Slate + green palette (Figma COLOR TOKENS). User-selectable in Profile → Theme.

### Figma palette mapping

| Figma swatch | Hex | App token |
|---|---|---|
| surface | `#F8FAFC` | `bg` |
| text | `#0F172A` | `text` |
| muted | `#64748B` | `textSec`, `textMuted` |
| green | `#22C55E` | `accent`, `green` |
| green-light | `#DCFCE7` | `accentBg` |
| green-dark | `#16A34A` | `accentBgStrong` (15% tint) |
| navy | `#1E293B` | `overlay` (40% opacity) |
| red | `#EF4444` | `red` |
| orange | `#EA580C` | `orange` |
| blue | `#3B82F6` | `blue` |
| amber | `#F59E0B` | *(not mapped — use `orange` for warnings)* |

Derived tokens (not in Figma swatches, required for UI):

| Token | Value | Notes |
|---|---|---|
| `bgCard`, `bgSurface`, `bgInput`, `sheetBg` | `#FFFFFF` | White cards on surface background |
| `border`, `pillBorder` | `#E2E8F0` | Slate-200 companion |

### Backgrounds & surfaces

| Token | Value | Usage |
|---|---|---|
| `bg` | `#F8FAFC` | Page / screen background |
| `bgCard` | `#FFFFFF` | Cards, list rows |
| `bgSurface` | `#FFFFFF` | Panels |
| `bgInput` | `#FFFFFF` | Inputs (border provides contrast) |
| `sheetBg` | `#FFFFFF` | Modals, bottom sheets |

### Text

| Token | Value | Usage |
|---|---|---|
| `text` | `#0F172A` | Headings, body |
| `textSec` | `#64748B` | Descriptions, metadata |
| `textMuted` | `#64748B` | Labels, placeholders |

### Brand & status

| Token | Value | Usage |
|---|---|---|
| `accent` | `#22C55E` | Primary buttons, active nav |
| `accentBg` | `#DCFCE7` | Hover / selected row tint |
| `accentBgStrong` | `rgba(22,163,74,0.15)` | Active chip, verified badge |
| `red` | `#EF4444` | Errors, destructive |
| `orange` | `#EA580C` | Warnings |
| `green` | `#22C55E` | Success (same as accent) |
| `blue` | `#3B82F6` | Info, links |

### Borders, pills, overlay

| Token | Value | Usage |
|---|---|---|
| `border` | `#E2E8F0` | Card borders, dividers |
| `pillBg` | `rgba(255,255,255,0.95)` | Floating pills |
| `pillBorder` | `#E2E8F0` | Pill outline |
| `overlay` | `rgba(30,41,59,0.4)` | Navy scrim |

### Shadows

| Token | CSS | Web equivalent |
|---|---|---|
| `shadow` | `0 2px 20px rgba(15,23,42,0.08)` | `box-shadow: 0 2px 20px rgb(15 23 42 / 0.08)` |
| `shadowSm` | `0 1px 8px rgba(15,23,42,0.04)` | `box-shadow: 0 1px 8px rgb(15 23 42 / 0.04)` |

---

## Web — CSS custom properties

Copy into `:root` / `[data-theme="dark"]` / `[data-theme="light"]`:

```css
/* Dark (default) */
[data-theme="dark"],
:root {
  --cm-bg: #0a0a0a;
  --cm-bg-card: #161616;
  --cm-bg-surface: #111111;
  --cm-bg-input: #1a1a1a;
  --cm-border: #2a2a2a;
  --cm-text: #f0f0f0;
  --cm-text-sec: #888888;
  --cm-text-muted: #555555;
  --cm-accent: #b8f200;
  --cm-accent-bg: rgba(184, 242, 0, 0.08);
  --cm-accent-bg-strong: rgba(184, 242, 0, 0.15);
  --cm-red: #ff4757;
  --cm-orange: #ffa502;
  --cm-green: #2ed573;
  --cm-blue: #3498db;
  --cm-pill-bg: rgba(20, 20, 20, 0.92);
  --cm-pill-border: #333333;
  --cm-sheet-bg: #111111;
  --cm-overlay: rgba(0, 0, 0, 0.7);
  --cm-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  --cm-shadow-sm: 0 1px 8px rgba(0, 0, 0, 0.3);
}

/* Light */
[data-theme="light"] {
  --cm-bg: #f8fafc;
  --cm-bg-card: #ffffff;
  --cm-bg-surface: #ffffff;
  --cm-bg-input: #ffffff;
  --cm-border: #e2e8f0;
  --cm-text: #0f172a;
  --cm-text-sec: #64748b;
  --cm-text-muted: #64748b;
  --cm-accent: #22c55e;
  --cm-accent-bg: #dcfce7;
  --cm-accent-bg-strong: rgba(22, 163, 74, 0.15);
  --cm-red: #ef4444;
  --cm-orange: #ea580c;
  --cm-green: #22c55e;
  --cm-blue: #3b82f6;
  --cm-pill-bg: rgba(255, 255, 255, 0.95);
  --cm-pill-border: #e2e8f0;
  --cm-sheet-bg: #ffffff;
  --cm-overlay: rgba(30, 41, 59, 0.4);
  --cm-shadow: 0 2px 20px rgba(15, 23, 42, 0.08);
  --cm-shadow-sm: 0 1px 8px rgba(15, 23, 42, 0.04);
}
```

Toggle theme on `<html>` or `<body>`:

```html
<html data-theme="light">
```

Or respect system preference:

```css
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    /* paste [data-theme="light"] block here */
  }
}
```

---

## Web — Tailwind CSS (optional)

```js
// tailwind.config.js — extend colors
module.exports = {
  theme: {
    extend: {
      colors: {
        cm: {
          bg: 'var(--cm-bg)',
          card: 'var(--cm-bg-card)',
          surface: 'var(--cm-bg-surface)',
          input: 'var(--cm-bg-input)',
          border: 'var(--cm-border)',
          text: 'var(--cm-text)',
          'text-sec': 'var(--cm-text-sec)',
          'text-muted': 'var(--cm-text-muted)',
          accent: 'var(--cm-accent)',
          'accent-bg': 'var(--cm-accent-bg)',
          'accent-bg-strong': 'var(--cm-accent-bg-strong)',
          red: 'var(--cm-red)',
          orange: 'var(--cm-orange)',
          green: 'var(--cm-green)',
          blue: 'var(--cm-blue)',
        },
      },
      boxShadow: {
        cm: 'var(--cm-shadow)',
        'cm-sm': 'var(--cm-shadow-sm)',
      },
    },
  },
};
```

Example usage:

```html
<div class="bg-cm-bg text-cm-text border border-cm-border rounded-lg shadow-cm-sm">
  <button class="bg-cm-accent text-black font-bold px-4 py-2 rounded-md">
    Book now
  </button>
</div>
```

**Note:** On light theme, primary button text is dark (`#0F172A` or black) for contrast on green `#22C55E`. On dark theme, button text is black on lime `#B8F200`.

---

## Web — TypeScript (shared tokens)

Import directly from the shared package (same as mobile):

```ts
import { darkTheme, lightTheme, type ThemeTokens } from '@courtmap/booking-ui';

function getTheme(mode: 'dark' | 'light'): ThemeTokens {
  return mode === 'light' ? lightTheme : darkTheme;
}
```

For a Next.js / React web app without React Native, copy values into CSS variables or a `theme.css` file — do not import RN-specific components.

---

## Typography & layout (web parity)

Fonts used in mobile (load via Google Fonts on web):

| Role | Family | Weights |
|---|---|---|
| UI / body | [DM Sans](https://fonts.google.com/specimen/DM+Sans) | 400, 600, 700, 800 |
| Logo / display | [Archivo Black](https://fonts.google.com/specimen/Archivo+Black) | 400 |

### Spacing (px)

| Token | Value |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 20 |
| `2xl` | 24 |
| `3xl` | 32 |
| `4xl` | 40 |
| `5xl` | 48 |

### Border radius (px)

| Token | Value |
|---|---|
| `sm` | 6 |
| `md` | 10 |
| `lg` | 14 |
| `xl` | 20 |
| `full` | 999 |

### Font sizes (px)

| Token | Value |
|---|---|
| `xs` | 11 |
| `sm` | 13 |
| `md` | 15 |
| `lg` | 17 |
| `xl` | 20 |
| `2xl` | 24 |
| `3xl` | 30 |
| `title` | 28 |

---

## Usage guidelines

1. **Always use semantic tokens** (`accent`, `textSec`) — never hardcode hex in components.
2. **Accent differs by theme:** dark uses neon lime `#B8F200`; light uses green `#22C55E`. Do not reuse dark accent on light backgrounds.
3. **Primary buttons:** background = `accent`; text = black (dark) or `#0F172A` (light).
4. **Cards:** `bgCard` + `border` + `shadowSm` on light; often border-only on dark.
5. **Status colors:** `red` / `orange` / `green` / `blue` are theme-specific — always read from tokens.
6. **Overlay:** use `overlay` behind modals; click target should cover full viewport.

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-13 | Light theme updated to Figma COLOR TOKENS (slate + green palette) |
| 2026-06-13 | Initial doc — dark theme + web CSS variables |

---

## Related files

| File | Purpose |
|---|---|
| `packages/booking-ui/src/lib/theme.ts` | Token source of truth |
| `mobile/context/CourtMapContext.tsx` | Theme mode persistence (`cm_theme` in AsyncStorage) |
| `mobile/app/(tabs)/profile.tsx` | Theme toggle UI |
| `packages/booking-ui/README.md` | Shared UI package overview |
