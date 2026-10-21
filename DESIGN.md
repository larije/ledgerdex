# Design System: LedgerDex Property Tax Management

## 1. Visual Theme & Atmosphere

LedgerDex is a civic finance workspace: precise, calm, and easy to scan during long record-review sessions. Keep the density balanced (6/10), layout variance low (3/10), and motion restrained (2/10). Use clear hierarchy and generous row spacing to make financial values and account status easy to verify.

## 2. Color Palette & Roles

- **Ledger Canvas** (`#F8FAFC`) — Main page background.
- **Paper Surface** (`#FFFFFF`) — Cards, dialogs, and form surfaces.
- **Raised Slate** (`#F1F5F9`) — Table headers and subtle inset areas.
- **Charcoal Ink** (`#111827`) — Primary labels and amounts; never use pure black.
- **Muted Slate** (`#4B5563`) — Supporting text and metadata.
- **Quiet Border** (`#E5E7EB`) — Card, table, and input boundaries.
- **Ledger Blue** (`#2563EB`) — The single decorative accent for primary actions, links, focus, and active navigation.
- **Status colors** — Emerald (`#059669`) for settled/paid, amber (`#B45309`) for projected/partial, and red (`#DC2626`) for outstanding. Reserve these colors for meaning; do not use them as decorative accents.

For dark mode, use `#0F172A` for the canvas, `#1E293B` for surfaces, `#334155` for borders, `#F1F5F9` for primary text, and `#94A3B8` for muted text. Keep Ledger Blue as the action accent and preserve the same semantic status colors.

## 3. Typography Rules

- **Product UI:** Geist Sans, with a restrained weight scale. Use 24–32px bold page titles and 14–16px body text.
- **Data:** Geist Mono for TD numbers, PINs, dates, and financial values. Use tabular numerals and right-align amounts.
- **Labels:** 11–12px semibold uppercase with modest tracking; reserve this treatment for field labels and table headings.
- Keep paragraphs and helper text short. Maintain readable contrast and avoid using size alone to establish hierarchy.

## 4. Component Stylings

- **Buttons:** Use a 12px radius, minimum 44px touch height, and solid Ledger Blue for the primary action. Keep secondary actions outlined or quiet. On press, move down 1px; use no glow.
- **Cards:** Use a 16px radius, white surface, quiet 1px border, and a low, slate-tinted shadow. Use cards to separate meaningful sections; avoid extra nested cards.
- **Inputs:** Place labels above controls. Use a clear blue focus ring, consistent border color, and inline validation below the field.
- **Tables:** Keep headers subdued, data rows white, dividers thin, and financial columns right-aligned. Use blue row highlighting only for the selected account.
- **Empty states:** Keep them compact and explain what is absent. Hide optional local-payment history when there are no local payments.
- **Loading and errors:** Match skeletons to the content they replace. Show errors inline with a clear recovery action.

## 5. Layout Principles

- Center the workspace with a maximum width around 1720px; retain the established 272px sidebar and 64px header on desktop.
- Use a consistent 16–24px section rhythm and 20–24px card padding.
- Keep forms left-to-right and predictable. Place each form's primary save action at the lower-right edge, as in the account Notes panel.
- Collapse multi-column content to one column below 768px. Prevent horizontal page overflow; allow only tables to scroll horizontally when needed.
- Align currency values to the right and keep currency symbols, decimals, and source labels visually grouped.

## 6. Motion & Interaction

- Use short 150–200ms transitions for color, opacity, and small transforms. Give pressed controls a subtle 1px downward response.
- Keep account data and status indicators still when idle. Animate a sync indicator only while a sync is actively running.
- Respect `prefers-reduced-motion`; do not rely on movement to communicate status or availability.
- Provide visible keyboard focus and touch targets of at least 44px for primary controls.

## 7. Anti-Patterns

- Never use neon blue/purple, decorative gradients, or outer-glow shadows.
- Never use pure black, decorative status colors, emojis, or custom cursors.
- Never use equal-width three-card rows as a default layout; group financial metrics according to their source and meaning.
- Never overlap content, hide labels inside inputs, or use motion as decoration on static financial records.
- Never use generic placeholder names or vague empty-state copy.
