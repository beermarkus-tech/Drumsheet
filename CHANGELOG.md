# Changelog

Build numbers shown in the app header (`Build NN`), counting up after each
completed unit of work. Each build is pushed to the working branch so
GitHub Pages redeploys and it's directly testable as the installed PWA.

## Build 18

- Same idea for 1/2 and Full bars: every bar now shows only the lines on
  its own cell boundaries. 1/2 keeps just the middle line (beat 3), Full
  has no inner lines at all (light and dark-grey quarter lines hidden).
  The black bar edges always stay. On screen and in the PDF.

## Build 17

- Correction to Build 15: 1/8 bars now hide only the 16th lines ("e" and
  "a") and keep the light-grey "&" lines between the 8th notes; 1/4 bars
  hide both the 16th and the "&" lines (only quarter lines remain). On
  screen and in the PDF.

## Build 16

- The Title field in the song info bar is wider: up to 420px (was 150px),
  shrinking with the window but never below the old 150px.

## Build 15

- Bars set to 1/8 or 1/4 subdivision no longer show the light-grey
  e/&/a lines, only the dark-grey quarter-note lines (and the black bar
  edges) — on screen and in the PDF, per bar. 1/16, 1/2 and Full bars and
  the header count are unchanged.

## Build 14

- The Bars cell is now a button that opens a small "Bars" dialog with two
  fields: **Multiplier** (–, 2x, 3x, 4x, 5x, 6x) and **Bars** (-, 2, 4, 6,
  8), with a preview. OK writes e.g. "4" or "2x4" into the cell; Cancel
  changes nothing. The multiplier is display-only: grouping still uses
  the bar count (2x4 covers 2 rows, like 4). It needs a bar count, and
  clearing the bars clears it too. Saved per row as `barsMultiplier`; the
  PDF shows the same label and widens the Bars column if needed.

## Build 13

- Fix: sorting in the Load Song list works. Tap "Band Name" or "Song
  Title" to sort by it, tap again to reverse; an arrow shows the active
  column and direction. Ties are sorted by the other column, case doesn't
  matter, numbers sort naturally ("Song 9" before "Song 10"). Default is
  by band A→Z; the choice is remembered on the device.

## Build 12

- **PDF: emoji and other symbols print correctly.** The PDF's built-in font
  only covers Western (Latin-1) characters, so e.g. 💥 came out as "Ø=Ü¥".
  Any text with other characters (emoji, arrows, curly quotes, other
  scripts) is now drawn as a small high-resolution image (~400dpi) in the
  device's own font/emoji style, in the same place; everything else stays
  vector text. Works in cells, lyrics, structure names and the title.
- **Duplicate and delete songs** from the Load Song list (icon buttons on
  each row; tapping the row still opens the song).
  - Duplicate asks for a title (suggests "Title (copy)", must be unique)
    and highlights the copy in the list. Duplicating the open song saves
    its latest edits first.
  - Delete asks for confirmation. Deleting the open song closes the editor
    (pending edits for it are discarded) and it won't be reopened on the
    next launch.

## Build 11

- **PDF is now real vector graphics**, drawn directly with jsPDF instead of
  a screenshot of the page: sharp at any zoom, real (searchable) text,
  ~0.1s to create, ~30KB per page. Drawing order is fills → light lines →
  dark lines → thick black lines → text, so thick lines are never covered
  and lines never cut through symbols. html2canvas removed.
- **New "Bars" column** between Lyrics and Bar 1 (dropdown: -, 2, 4, 6, 8).
  Set it on the first row of a group; since a row holds 2 bars, the group
  covers value/2 rows. Covered rows are greyed out/disabled in the editor
  (no merged box on screen). A group stops at a new section and at the end
  of the song. In the PDF the group is one merged box with the number,
  normal row lines around it, and a group is never split across pages.
  Saved per row as `bars`.
- A new section now means: the structure differs from the last non-empty
  structure above (rows without a structure don't end a section).

## Build 10

- **Reload button** (top right, next to the build number): saves pending
  edits, checks for a new build, installs it and reloads, so a new build
  shows up after one tap instead of closing/relaunching the app twice. The
  service worker now fetches files bypassing the browser's HTTP cache, so
  a new build never picks up stale copies.
- **Reopens the last song** on launch (remembered on this device). With no
  song opened before, the app starts empty; if that song was deleted, too.
- **Print → PDF download.** "Print Sheet" is now "Download PDF": the sheet
  is laid out on A4 pages and saved as `Band - Title.pdf` directly, no
  preview window. Rows that don't fit go to the next page; every page
  repeats the title, band, BPM (plus "Page x / y") and the table header. A
  Structure/Lyrics box running over a page break continues, labelled, on
  the next page. PDF libraries (html2canvas, jsPDF; MIT) are bundled in
  `js/vendor/` and cached, so export also works offline.
- **Thick line at each new section** in the PDF (e.g. Chorus → Solo), same
  3px black as the bar edges.
- **Structure colors update live** while editing them in Configure. Close
  without saving reverts; saving also applies renamed structures to the
  open song.
- Fix: a row whose structure isn't in the configuration (e.g. renamed or
  deleted) now keeps it instead of showing "-" (which autosave would then
  have written back, erasing it).

## Build 09

- Sidebar: the Symbol and Color lists are always the same height, and the
  "Insert Symbol / Color" section stretches to fill all spare sidebar
  height (min. 150px; the sidebar scrolls on very short screens). A
  leftover 150px height cap on the symbol list made it shorter before.
- Print sheet grid lines and borders now match the screen: each bar edged
  in black (3px, one shared line between bar 1 and 2), dark-grey
  quarter-note lines, light-grey e/&/a lines, always-visible 16th ruler
  (also through merged cells), light-grey split divider, dark-grey row
  lines, light-grey Structure/Lyrics column lines. Header is the full
  "1 e & a" count. Fixes missing lines in merged cells and doubled
  cell/table borders. Colors are read from the editor's `--line-*`
  variables. Merged Structure/Lyrics boxes unchanged.

## Build 08

- **Autosave replaces manual saving.** The "Save Song" and "Update Info"
  buttons are gone. Any change (cells, symbols, colors, subdivision,
  split, paste, clear, rows, structure, lyrics, title/band/BPM) is saved
  300ms after the last edit, title/band/BPM and rows together in one write.
  Opening a song or just selecting cells writes nothing.
- Status in the top-right replaces the Save button: "All changes saved",
  "Saving…", "Offline – will sync when back online", or a warning/error.
- Edits made while a save is in progress are saved right after it; failed
  saves retry automatically (2s, 4s, … up to 30s) without losing edits.
- Pending edits are saved before opening/creating another song, when the
  app goes to the background, and the browser warns before closing the tab
  with unsaved changes. Ctrl+S saves immediately (also while typing).
- Title rules kept: an empty title or one used by another song isn't
  applied (a warning says so); everything else still saves.

## Build 07

- The cell edit popup is now a permanent sidebar on the right (280px),
  shown whenever a song is open. Click a cell to select it (blue outline);
  the header shows which cell, e.g. "Row 3 · Bar 1 · 2&". With nothing
  selected the controls are greyed out.
- The selection stays put after every action, so you can apply a symbol,
  then a color, then change the subdivision without re-clicking. Actions
  that rebuild the bar (subdivision, split/merge, paste, clear bar) move the
  selection to the cell now covering the same 16th position. Deleting the
  selected row or loading another song clears it.
- Symbol and color lists are taller (no more cramped scrolling).
- Clicking elsewhere no longer dismisses anything; saved data and print
  output are unchanged from Build 06.

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
- Search in Load Song list.
- Revision snapshots for autosave (e.g. `songs/{id}/revisions` on open and
  every ~10 min) so a bad edit can be rolled back.
- Realtime sync (`onSnapshot`) and offline editing via Firestore's built-in
  persistence.
- Deep links to a specific song (`?song=<id>`).
- Metronome/click playback using the stored BPM.
- Version history / revision snapshots.
- PDF export for the print sheet; real app icon/branding.
