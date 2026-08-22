# Changelog

Build numbers shown in the app header (`Build NN`), counting up after each
completed unit of work. Each build is pushed to the working branch so
GitHub Pages redeploys and it's directly testable as the installed PWA.

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

- 8th/16th display toggle: will change the header and gridline visibility,
  consolidated with the per-bar subdivision setting in the context menu.
- Delete song, duplicate/"Save As", search in Load Song list.
- Autosave / dirty-state indicator (`window.markUnsaved` is currently a
  no-op stub).
- Realtime sync (`onSnapshot`) and offline editing via Firestore's built-in
  persistence.
- Deep links to a specific song (`?song=<id>`).
- Metronome/click playback using the stored BPM.
- Version history / revision snapshots.
- PDF export for the print sheet; real app icon/branding.
