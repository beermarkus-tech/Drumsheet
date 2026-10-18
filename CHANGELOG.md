# Changelog

Build numbers shown in the app header (`Build NN`), counting up after each
completed unit of work. Each build is pushed to the working branch so
GitHub Pages redeploys and it's directly testable as the installed PWA.

## Build 06

- Fix: text containing quotes, `<`, `>` or `&` was corrupted on screen and,
  for lyrics/structures/symbols, on save. E.g. lyrics `He said "go"` showed
  and saved as `He said `, a structure named `Chorus "A"` saved as
  `Chorus `, and a cell symbol like `<o>` vanished. All stored text is now
  HTML-escaped (`escapeHtml()` in `js/main.js`) wherever it's inserted
  into the page: editor rows, cell symbols, cell popup, song list,
  Configure dialog, and the print sheet. Songs without such characters
  render byte-for-byte the same as Build 05.
- Service worker cache renamed per build (`drumsheet-shell-build-06`) so
  installed PWAs reliably pick up new JS/CSS. Bump it with every build.

## Build 05

- Thickened the black bar-boundary lines (start of bar 1, the shared
  junction between bar 1/2, end of bar 2) from 2px to 3px, to give clearer
  contrast against the dark-grey quarter-note lines without having to
  lighten those further. Header's matching divider bumped to match.

## Build 04

- Correction to Build 03: the split-bar divider (the line between a split
  bar's main/aux lanes, i.e. its horizontal "subdivision") is light grey
  again, matching the 16th-note ("e"/"&"/"a") tint — it had incorrectly
  been set to the same dark grey as the row divider. The row-separator
  line under each editor row stays dark grey, unchanged.

## Build 03

- Grid lines are now a distinguishable three-tier system, driven by CSS
  variables (`--line-strong`, `--line-dark`, `--line-light` in
  `css/style.css`): black for the bar's own edges (before beat 1 / after
  the last "a"), dark grey for the quarter-note lines (2, 3, 4), light
  grey for "e"/"&"/"a". Horizontal grid lines (the line under each editor
  row, and the divider between a split bar's main/aux lanes) now use the
  same dark-grey tint as the quarter-note lines, tying the whole grid
  together visually.
- Header labels: only "1"/"2"/"3"/"4" stay bold; "e"/"&"/"a" are now
  regular weight.
- Still deferred to the print stylesheet (separate, self-contained CSS in
  `js/print.js`) — will bring the same three-tier system over there later.

## Build 02

- Bar grid now shows an always-visible 16th-note ruler (strong tick before
  every quarter, faint before "e"/"&"/"a"), independent of each bar's actual
  subdivision setting — the ticks stay visible even when cells are merged
  into a coarser subdivision. Replaces the old per-cell border approach,
  which disappeared whenever cells were merged.
- Bar header changed to the full 16-position "1 e & a  2 e & a  ..." count,
  matching the new ruler.
- Print sheet intentionally left unchanged for now (deferred).

## Build 01

Baseline: the Google Apps Script app ported to a standalone Firebase-backed
PWA, brought up to match the live v1.1 feature set (split/aux bars,
ghost-paste, color-swatch popup, keyboard shortcuts), with existing sheet
data migrated into Firestore.

## Backlog (not yet scheduled)

- **Close the database (required before sharing the URL).** Firestore rules
  are currently fully open: anyone with the URL can read, overwrite or
  delete every song. Add sign-in (e.g. Google via Firebase Auth) and
  restrict rules to allowed user(s).
- 8th/16th display toggle: will change the header and gridline visibility,
  consolidated with the per-bar subdivision setting in the context menu.
- Settings-modal tab for customizing the three grid line tints
  (`--line-strong`/`--line-dark`/`--line-light`) directly in the app.
- Bring the three-tier grid line system to the print stylesheet.
- Delete song, duplicate/"Save As", search in Load Song list.
- Autosave / dirty-state indicator (`window.markUnsaved` is currently a
  no-op stub).
- Realtime sync (`onSnapshot`) and offline editing via Firestore's built-in
  persistence.
- Deep links to a specific song (`?song=<id>`).
- Metronome/click playback using the stored BPM.
- Version history / revision snapshots.
- PDF export for the print sheet; real app icon/branding.
