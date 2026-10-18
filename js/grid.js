let activeCell = null;
let clipboardBar = null; // Holds the copied bar data

// --- BAR GROUPS ("Bars" column) ---
// A row's "Bars" value (2/4/6/8) starts a group of that many bars. Each row holds
// 2 bars, so the group covers value/2 rows: this one and the following ones. A
// group never crosses into a new section and stops at the end of the song.
// Only the first row carries the value; covered rows are disabled in the editor
// (no merged box on screen). The PDF draws the group as one merged box.
// An optional multiplier (2x-6x) is display-only, e.g. "2x4"; grouping always
// uses the bar count. Both are picked in #barsModal.

function barsLabel(bars, mult) {
  if (!bars) return '';
  return mult ? `${mult}x${bars}` : String(bars);
}

// A new section starts where a (non-empty) structure differs from the last
// non-empty structure above it (rows without a structure don't end a section)
function isSectionStart(structs, i) {
  if (i === 0 || structs[i] === '') return false;
  for (let j = i - 1; j >= 0; j--) {
    if (structs[j] !== '') return structs[j] !== structs[i];
  }
  return false;
}

// rows: [{ bars, struct }] -> per row { span, covered }; span > 0 on a group's
// first row (number of rows it covers), 0 otherwise.
function computeBarGroups(rows) {
  const structs = rows.map(r => r.struct);
  const out = rows.map(() => ({ span: 0, covered: false }));
  for (let i = 0; i < rows.length;) {
    const size = parseInt(rows[i].bars);
    if (!size) { i++; continue; }
    let span = 1;
    while (span < size / 2 && i + span < rows.length && !isSectionStart(structs, i + span)) {
      out[i + span].covered = true;
      span++;
    }
    out[i].span = span;
    i += span;
  }
  return out;
}

// The Bars cell is a button holding data-bars / data-mult; it opens #barsModal
function setBarsButton(btn, bars, mult) {
  btn.dataset.bars = bars || '';
  btn.dataset.mult = bars ? (mult || '') : '';
  const label = barsLabel(btn.dataset.bars, btn.dataset.mult);
  if (btn.textContent !== (label || '-')) btn.textContent = label || '-';
}

// Also marks rows that start a new section (thick line on top, like the PDF)
window.refreshBarGroups = function () {
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  const structs = rows.map(r => r.querySelector('.struct-select').value);
  rows.forEach((row, i) => row.classList.toggle('section-start', isSectionStart(structs, i)));
  const groups = computeBarGroups(rows.map((r, i) => ({
    bars: r.querySelector('.bars-btn').dataset.bars,
    struct: structs[i]
  })));
  let cleared = false;
  rows.forEach((row, i) => {
    const btn = row.querySelector('.bars-btn');
    const covered = groups[i].covered;
    if (covered && btn.dataset.bars) { setBarsButton(btn, '', ''); cleared = true; }
    if (btn.disabled !== covered) btn.disabled = covered;
    row.classList.toggle('bars-covered', covered);
  });
  if (cleared) window.markUnsaved();
};

// --- BARS MODAL ---
let barsModalTarget = null;

window.openBarsModal = function (btn) {
  barsModalTarget = btn;
  document.getElementById('bars-count').value = btn.dataset.bars || '';
  document.getElementById('bars-mult').value = btn.dataset.mult || '';
  updateBarsModalPreview();
  document.getElementById('barsModal').style.display = 'flex';
};

window.updateBarsModalPreview = function () {
  const bars = document.getElementById('bars-count').value;
  const mult = document.getElementById('bars-mult');
  mult.disabled = !bars;                       // a multiplier needs a bar count
  const label = barsLabel(bars, mult.value);
  document.getElementById('bars-preview').textContent = label || '(empty)';
};

window.applyBarsModal = function () {
  if (barsModalTarget && barsModalTarget.isConnected) {
    const bars = document.getElementById('bars-count').value;
    setBarsButton(barsModalTarget, bars, document.getElementById('bars-mult').value);
    window.refreshBarGroups();
    window.markUnsaved();
  }
  barsModalTarget = null;
  closeModal('barsModal');
};

// --- ROW GENERATION ---
window.addEditorRow = function (data = { structure: '', lyrics: '', gridData: '{}' }, afterElement = null) {
  const div = document.createElement('div');
  div.className = 'editor-row';

  let gridObj = {};
  try { gridObj = JSON.parse(data.gridData); } catch(e) {}

  let structOptions = `<option value="">-</option>`;
  let currentColor = 'black';
  if(typeof configData !== 'undefined' && configData.structures) {
      configData.structures.forEach(s => {
        const selected = s.name === data.structure ? 'selected' : '';
        if (selected) currentColor = s.color;
        structOptions += `<option value="${escapeHtml(s.name)}" style="color:${escapeHtml(s.color)}" ${selected}>${escapeHtml(s.name)}</option>`;
      });
  }
  // Keep a structure that isn't (or no longer is) in the config instead of
  // silently dropping it, so autosave never erases it.
  if (data.structure && !(configData.structures || []).some(s => s.name === data.structure)) {
      structOptions += `<option value="${escapeHtml(data.structure)}" selected>${escapeHtml(data.structure)}</option>`;
  }

  div.innerHTML = `
    <div class="col-struct">
        <select class="struct-select" style="color:${escapeHtml(currentColor)}" onchange="onStructureChange(this)">
          ${structOptions}
        </select>
    </div>

    <div class="col-lyrics">
        <input type="text" class="lyrics-input" value="${escapeHtml(data.lyrics)}" style="color:${escapeHtml(currentColor)}" placeholder="Lyrics...">
    </div>

    <div class="col-bars">
        <button type="button" class="bars-btn" title="Bars in this group (starts here)" onclick="openBarsModal(this)"
          data-bars="${escapeHtml(data.bars ? data.bars : '')}" data-mult="${escapeHtml(data.bars && data.barsMultiplier ? data.barsMultiplier : '')}">${escapeHtml(barsLabel(data.bars, data.barsMultiplier) || '-')}</button>
    </div>

    <div class="col-grid">
        ${window.generateBarHTML(1, gridObj)}
        ${window.generateBarHTML(2, gridObj)}
    </div>

    <div class="col-tools">
      <span class="material-icons action-icon add" onclick="insertRow(this)">add_circle</span>
      <span class="material-icons action-icon del" onclick="deleteRow(this)">delete</span>
    </div>
  `;

  const container = document.getElementById('rows-container');
  if (afterElement instanceof HTMLElement) {
      afterElement.after(div);
  } else {
      container.appendChild(div);
  }
};

// --- BAR GENERATION (Variable Width Logic) ---
window.generateBarHTML = function (barNum, gridObj) {
  const subdKey = `bar${barNum}_subd`;
  const splitKey = `bar${barNum}_split`;
  const repeatKey = `bar${barNum}_repeat`;

  let subd = parseInt(gridObj[subdKey]);
  if(![1, 2, 4, 8, 16].includes(subd)) subd = 8;

  const isSplit = gridObj[splitKey] === 'true' || gridObj[splitKey] === true;
  const isRepeat = gridObj[repeatKey] === 'true' || gridObj[repeatKey] === true;

  const slots = 16 / subd;

  // Helper to generate a strip of cells
  function generateStrip(prefix, extraClass = '') {
      let html = '';
      for(let i=1; i<=16; i+=slots) {
          const cellId = prefix + `b${barNum}_c${i}`;
          const cellData = gridObj[cellId] || { sym: '', color: '', text: '' };
          const endSlot = i + slots - 1;
          let cssClass = `grid-cell ${extraClass}`;
          if (endSlot % 4 === 0 && endSlot < 16) cssClass += ' border-dark';

          let style = `--slots:${slots};`;
          if (cellData.color) style += ` background-color:${escapeHtml(cellData.color)};`;

          let content = escapeHtml(cellData.sym || cellData.text || '');
          html += `<div class="${cssClass}" id="${cellId}" style="${style}" onclick="onCellClick(event, this)">${content}</div>`;
      }
      return html;
  }

  let innerHTML = '';
  if (isSplit) {
      innerHTML = `
          <div class="sub-line upper">${generateStrip('')}</div>
          <div class="sub-line lower">${generateStrip('aux_')}</div>
      `;
  } else {
      innerHTML = generateStrip('');
  }

  return `
  <div class="bar-container ${isSplit ? 'split-mode' : ''} ${isRepeat ? 'repeat-mode' : ''}"
       id="bar-${barNum}"
       data-subd="${subd}"
       data-split="${isSplit}"
       data-repeat="${isRepeat}">  ${innerHTML}${generateBarGridlines()}
  </div>`;
};

// Always-visible 16th-note ruler, independent of the bar's actual subdivision/merge
// state — a merged (wider) cell still shows the ticks for the 16th positions it spans.
// Strong before every quarter (1,5,9,13); the very first "1" coincides with the bar's
// own left border already, so only the 15 interior boundaries need a tick.
function generateBarGridlines() {
  let html = '<div class="bar-gridlines">';
  for (let k = 1; k <= 15; k++) {
      const strong = (k % 4 === 0);
      const eighth = !strong && k % 2 === 0;   // the "&" lines
      const half = k === 8;                     // beat 3
      html += `<div class="grid-tick${strong ? ' strong' : eighth ? ' eighth' : ''}${half ? ' half' : ''}" style="left:${(k / 16) * 100}%;"></div>`;
  }
  html += '</div>';
  return html;
}

// Full state of one bar as a gridObj (cells + subdivision/split/repeat), so it
// can be re-rendered with generateBarHTML without losing anything.
function scrapeBar(bar) {
  const barNum = bar.id.split('-')[1];
  const gridObj = {
    [`bar${barNum}_subd`]: bar.getAttribute('data-subd'),
    [`bar${barNum}_split`]: bar.getAttribute('data-split') === 'true',
    [`bar${barNum}_repeat`]: bar.getAttribute('data-repeat') === 'true'
  };
  bar.querySelectorAll('.grid-cell').forEach(cell => {
      if(cell.innerText || cell.style.backgroundColor) {
          gridObj[cell.id] = { sym: cell.innerText, color: cell.style.backgroundColor };
      }
  });
  return gridObj;
}

// Split/Merge every selected bar; all follow the anchor bar's new state
window.toggleSplit = function () {
  if(!activeCell) return;
  const newSplit = activeCell.closest('.bar-container').getAttribute('data-split') !== 'true';
  selectedBars().forEach(bar => {
      const barNum = bar.id.split('-')[1];
      const gridObj = scrapeBar(bar);
      gridObj[`bar${barNum}_split`] = newSplit;
      bar.outerHTML = window.generateBarHTML(barNum, gridObj);
  });
  window.closePopup();
};

window.generateHeaderBeats = function (id) {
  const el = document.getElementById(id);
  if(!el) return;
  let html = '';

  // Full 16th-note grid header (1 e & a  2 e & a  3 e & a  4 e & a), matching
  // the always-visible 16th gridline overlay. (A future 8th/16th display
  // toggle will make this configurable, consolidated with the per-bar
  // subdivision setting.)
  const beats = ['1','e','&','a','2','e','&','a','3','e','&','a','4','e','&','a'];

  beats.forEach(b => {
      const isMajor = /^[1234]$/.test(b);
      html += `<div class="beat-num${isMajor ? '' : ' minor'}" style="--slots:1; flex: 0 0 calc(var(--cell-width) * 1);">${b}</div>`;
  });
  el.innerHTML = html;
};

// --- INTERACTION ---
window.onStructureChange = function (selectElem) {
  const selectedName = selectElem.value;
  const structConfig = configData.structures.find(s => s.name === selectedName);

  // Default to black if not found or empty
  const color = structConfig ? structConfig.color : '#333';

  // 1. Change the text color of the SELECT element to match the choice
  selectElem.style.color = color;

  // 2. Change the lyrics input color too
  selectElem.closest('.editor-row').querySelector('.lyrics-input').style.color = color;

  // 3. Section boundaries limit bar groups
  window.refreshBarGroups();
};

window.insertRow = function (btn) { window.addEditorRow(undefined, btn.closest('.editor-row')); };
window.deleteRow = function (btn) { btn.closest('.editor-row').remove(); syncSelection(); };

// --- EDIT SIDEBAR LOGIC / SELECTION ---
// The edit panel (#cellPopup) is a permanent sidebar. The selection is a range
// in reading order (row by row, bar 1 then bar 2) between an anchor and a
// focus position { row, barNum, aux, idx (1-16) }:
//   - tap a cell: select just that cell (anchor = focus)
//   - long-press (or Shift+click) another cell: select everything from the
//     anchor to there
//   - "Select bar" / "Select row" in the sidebar
// The range stays in the anchor's lane (main or aux); a bar without that lane
// uses its main lane. Positions survive bars being re-rendered (subdivision,
// split, paste...), so the selected cells are recomputed after every edit.
let selAnchor = null, selFocus = null;
let selectedCells = [];

function cellPos(cell) {
  return {
      row: cell.closest('.editor-row'),
      barNum: parseInt(cell.closest('.bar-container').id.split('-')[1]),
      aux: cell.id.startsWith('aux_'),
      idx: parseInt(cell.id.split('_c')[1])
  };
}

// Position in 16ths from the start of the song
function linearPos(pos, rows) {
  return (rows.indexOf(pos.row) * 2 + (pos.barNum - 1)) * 16 + (pos.idx - 1);
}

function laneCells(bar, aux) {
  const cells = [...bar.querySelectorAll('.grid-cell')];
  const lane = cells.filter(c => c.id.startsWith('aux_') === aux);
  return lane.length ? lane : cells.filter(c => !c.id.startsWith('aux_'));
}

function resolveSelection() {
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  if (!selAnchor || !rows.includes(selAnchor.row)) return [];
  if (!selFocus || !rows.includes(selFocus.row)) selFocus = { ...selAnchor };
  const a = linearPos(selAnchor, rows), b = linearPos(selFocus, rows);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const cells = [];
  for (let r = Math.floor(lo / 32); r <= Math.floor(hi / 32); r++) {
      [1, 2].forEach(barNum => {
          const bar = rows[r].querySelector(`#bar-${barNum}`);
          const slots = 16 / (parseInt(bar.getAttribute('data-subd')) || 8);
          laneCells(bar, selAnchor.aux).forEach(cell => {
              const start = (r * 2 + barNum - 1) * 16 + parseInt(cell.id.split('_c')[1]) - 1;
              if (start + slots - 1 >= lo && start <= hi) cells.push(cell);
          });
      });
  }
  return cells;
}

function selectedBars() {
  return [...new Set(selectedCells.map(c => c.closest('.bar-container')))];
}

window.onCellClick = function (event, cell) {
  event.stopPropagation();
  if (event.shiftKey && selAnchor) extendSelectionTo(cell);
  else selectCell(cell);
};

function selectCell(cell) {
  selAnchor = cellPos(cell);
  selFocus = { ...selAnchor };
  syncSelection();
}

function extendSelectionTo(cell) {
  if (!selAnchor || !selAnchor.row.isConnected) { selectCell(cell); return; }
  selFocus = cellPos(cell);
  syncSelection();
}

window.selectWholeBar = function () {
  if (!selAnchor) return;
  const { row, barNum, aux } = selAnchor;
  selAnchor = { row, barNum, aux, idx: 1 };
  selFocus = { row, barNum, aux, idx: 16 };
  syncSelection();
};

window.selectWholeRow = function () {
  if (!selAnchor) return;
  const { row, aux } = selAnchor;
  selAnchor = { row, barNum: 1, aux, idx: 1 };
  selFocus = { row, barNum: 2, aux, idx: 16 };
  syncSelection();
};

function clearSelection() {
  document.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
  activeCell = null;
  selAnchor = selFocus = null;
  selectedCells = [];
  document.getElementById('popup-comment').value = '';
  document.querySelectorAll('.subd-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('sidebar-selection').textContent = 'Tap a cell · long-press another to select a range';
  document.getElementById('cellPopup').classList.add('no-selection');
}
window.clearSelection = clearSelection;

// Selection as row indices (rows are re-created by undo/redo) and back
window.selectionToIndices = function () {
  if (!selAnchor) return null;
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  return { anchor: { ...selAnchor, row: rows.indexOf(selAnchor.row) }, focus: { ...selFocus, row: rows.indexOf(selFocus.row) } };
};
window.selectionFromIndices = function (sel) {
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  if (!sel || !rows[sel.anchor.row]) { clearSelection(); return; }
  selAnchor = { ...sel.anchor, row: rows[sel.anchor.row] };
  selFocus = { ...sel.focus, row: rows[sel.focus.row] || rows[sel.anchor.row] };
  syncSelection();
};

const COUNTS = ['', 'e', '&', 'a'];
function describePos(p) {
  const r = Math.floor(p / 32) + 1, bar = Math.floor(p / 16) % 2 + 1, i = p % 16;
  return { r, bar, i, beat: `${Math.floor(i / 4) + 1}${COUNTS[i % 4]}` };
}

// Re-resolve the selection and update the highlight and the sidebar
function syncSelection() {
  document.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
  selectedCells = resolveSelection();
  if (selectedCells.length === 0) { clearSelection(); return; }
  selectedCells.forEach(c => c.classList.add('cell-selected'));

  // The anchor cell drives single-bar actions (copy, paste, clear bar)
  const anchorBar = selAnchor.row.querySelector(`#bar-${selAnchor.barNum}`);
  const anchorSlots = 16 / (parseInt(anchorBar.getAttribute('data-subd')) || 8);
  const lane = laneCells(anchorBar, selAnchor.aux);
  activeCell = lane.find(c => { const s = parseInt(c.id.split('_c')[1]); return s <= selAnchor.idx && selAnchor.idx < s + anchorSlots; }) || selectedCells[0];

  populateSidebarLists();

  // Cell text: shown when all selected cells have the same text
  const texts = new Set(selectedCells.map(c => c.innerText));
  document.getElementById('popup-comment').value = texts.size === 1 ? [...texts][0] : '';

  // Subdivision: highlighted when all selected bars share it
  const subds = new Set(selectedBars().map(b => parseInt(b.getAttribute('data-subd')) || 8));
  document.querySelectorAll('.subd-btn').forEach(btn => {
      btn.classList.toggle('active', subds.size === 1 && parseInt(btn.dataset.val) === [...subds][0]);
  });

  // Label, e.g. "Row 3 · Bar 1 · 2&", "Row 3 · Bar 1 (8 cells)",
  // "Row 3 · Bar 1 · 2& → Row 4 · Bar 2 · 3 (11 cells)"
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  const a = linearPos(selAnchor, rows), b = linearPos(selFocus, rows);
  const lo = describePos(Math.min(a, b)), hi = describePos(Math.max(a, b));
  const aux = selAnchor.aux ? ' (aux)' : '';
  let label;
  if (selectedCells.length === 1) label = `Row ${lo.r} · Bar ${lo.bar} · ${lo.beat}`;
  else if (lo.r === hi.r && lo.i === 0 && hi.i === 15 && lo.bar === hi.bar) label = `Row ${lo.r} · Bar ${lo.bar}`;
  else if (lo.r === hi.r && lo.i === 0 && hi.i === 15 && lo.bar === 1 && hi.bar === 2) label = `Row ${lo.r}`;
  else label = `Row ${lo.r} · Bar ${lo.bar} · ${lo.beat} → Row ${hi.r} · Bar ${hi.bar} · ${hi.beat}`;
  if (selectedCells.length > 1) label += ` (${selectedCells.length} cells)`;
  document.getElementById('sidebar-selection').textContent = label + aux;

  document.getElementById('cellPopup').classList.remove('no-selection');
}

// Long-press on a cell extends the selection to it (tablets have no Shift)
window.initCellSelection = function () {
  const container = document.getElementById('rows-container');
  const LONG_PRESS_MS = 450;
  let timer = null, startX = 0, startY = 0, suppressClick = false;
  const cancel = () => { clearTimeout(timer); timer = null; };

  container.addEventListener('pointerdown', (e) => {
      suppressClick = false;
      const cell = e.target.closest('.grid-cell');
      if (!cell) return;
      startX = e.clientX; startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
          timer = null;
          suppressClick = true;           // the click that ends this press
          extendSelectionTo(cell);
          if (navigator.vibrate) navigator.vibrate(15);
      }, LONG_PRESS_MS);
  });
  container.addEventListener('pointermove', (e) => {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => container.addEventListener(t, cancel));
  // Swallow the click after a long-press so it doesn't re-select a single cell
  container.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  // No browser context menu / callout on long-pressed cells
  container.addEventListener('contextmenu', (e) => { if (e.target.closest('.grid-cell')) e.preventDefault(); });
};

function populateSidebarLists() {
  // A. Symbols (left)
  const symContainer = document.getElementById('popup-symbols');
  symContainer.innerHTML = '';
  if(configData.symbols) {
      configData.symbols.forEach(s => {
          const row = document.createElement('div');
          row.className = 'symbol-row';
          row.onclick = () => window.selectSymbol(s);
          row.innerHTML = `<div class="symbol-preview" style="background-color:${escapeHtml(s.color)}">${escapeHtml(s.symbol)}</div><div class="symbol-meaning">${escapeHtml(s.meaning)}</div>`;
          symContainer.appendChild(row);
      });
  }

  // B. Colors (right)
  const colContainer = document.getElementById('popup-colors');
  colContainer.innerHTML = '';

  // 1. Transparent Option
  const clearDiv = document.createElement('div');
  clearDiv.className = 'color-swatch';
  clearDiv.style.background = 'white';
  clearDiv.style.backgroundImage = 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)';
  clearDiv.style.backgroundSize = '10px 10px';
  clearDiv.title = "Clear Background";
  clearDiv.onclick = () => window.selectBackgroundColor('');
  colContainer.appendChild(clearDiv);

  // 2. Palette Colors: light shade (left) and the slightly darker shade also
  // used for drum symbols in Configure (right), one row per color
  if(typeof PALETTE !== 'undefined') {
      PALETTE.forEach(c => {
          const pair = document.createElement('div');
          pair.className = 'color-pair';
          [[c.light, `${c.name} (light)`], [c.strong, c.name]].forEach(([hex, title]) => {
              const div = document.createElement('div');
              div.className = 'color-swatch';
              div.style.backgroundColor = hex;
              div.title = title;
              div.onclick = () => window.selectBackgroundColor(hex);
              pair.appendChild(div);
          });
          colContainer.appendChild(pair);
      });
  }
}

// --- EDIT ACTIONS (apply to every selected cell / bar) ---
window.selectSymbol = function (s) {
  if (!selectedCells.length) return;
  selectedCells.forEach(cell => {
      cell.innerText = s.symbol;
      cell.style.backgroundColor = s.color;
  });
  window.closePopup();
};

window.applyText = function () {
  if (!selectedCells.length) return;
  const text = document.getElementById('popup-comment').value;
  selectedCells.forEach(cell => { cell.innerText = text; });
  window.closePopup();
};

window.selectBackgroundColor = function (hex) {
  if (!selectedCells.length) return;
  selectedCells.forEach(cell => { cell.style.backgroundColor = hex; });
  window.closePopup();
  window.markUnsaved();
};

window.changeSubdivision = function (newSubd) {
  if (!selectedCells.length) return;
  selectedBars().forEach(bar => {
      const barNum = bar.id.split('-')[1];
      const gridObj = scrapeBar(bar);              // keeps split/ghost state
      gridObj[`bar${barNum}_subd`] = newSubd;
      bar.outerHTML = window.generateBarHTML(barNum, gridObj);
  });
  window.closePopup();
};

// --- CLIPBOARD FUNCTIONS ---

window.copyBar = function () {
  if(!activeCell) return;
  const bar = activeCell.closest('.bar-container');

  // 1. Scrape Bar Attributes
  const subd = bar.getAttribute('data-subd');
  const isSplit = bar.getAttribute('data-split') === 'true';

  const cellData = {};

  // 2. Scrape Cells (Distinguishing Main vs Aux)
  bar.querySelectorAll('.grid-cell').forEach(cell => {
      // ID formats: "b1_c5" OR "aux_b1_c5"
      // We need to extract the index (5) AND whether it is aux

      const isAux = cell.id.includes('aux_');
      const parts = cell.id.split('_c'); // Split at column marker

      if(parts.length > 1) {
          const idx = parts[1]; // e.g. "5"

          // Create a unique key for the clipboard: "5" or "aux_5"
          const key = isAux ? `aux_${idx}` : idx;

          cellData[key] = {
              sym: cell.innerText,
              color: cell.style.backgroundColor
          };
      }
  });

  clipboardBar = {
      subd: subd,
      split: isSplit, // Save split state
      cells: cellData
  };

  window.closePopup();
};

// --- PASTE FUNCTIONS ---

window.pasteBar = function () {
  _pasteLogic(false); // Normal paste (Not ghosted)
};

window.pasteRepeat = function () {
  _pasteLogic(true); // Ghost paste
};

// Internal helper to avoid duplicate code
function _pasteLogic(isGhost) {
  if(!activeCell || !clipboardBar) return;

  const targetBar = activeCell.closest('.bar-container');
  const targetBarNum = targetBar.id.split('-')[1];

  const newGridObj = {};

  // 1. Apply Structure
  newGridObj[`bar${targetBarNum}_subd`] = clipboardBar.subd;
  newGridObj[`bar${targetBarNum}_split`] = clipboardBar.split;
  newGridObj[`bar${targetBarNum}_repeat`] = isGhost;

  // 2. Apply Cells
  for (const [key, data] of Object.entries(clipboardBar.cells)) {
      let newId = '';
      if (key.startsWith('aux_')) {
          const idx = key.split('_')[1];
          newId = `aux_b${targetBarNum}_c${idx}`;
      } else {
          newId = `b${targetBarNum}_c${key}`;
      }
      newGridObj[newId] = data;
  }

  targetBar.outerHTML = window.generateBarHTML(targetBarNum, newGridObj);
  window.closePopup();
  window.markUnsaved();
}

window.clearCell = function () {
  if (!selectedCells.length) return;
  selectedCells.forEach(cell => {
      cell.innerText = '';
      cell.style.backgroundColor = '';
  });
  window.closePopup();
};

window.clearBar = function () {
  if(!activeCell) return;
  const bar = activeCell.closest('.bar-container');
  const barNum = bar.id.split('-')[1];

  // Create a fresh grid object with explicit defaults
  const newGridObj = {};
  newGridObj[`bar${barNum}_subd`] = 8;     // Reset to 8th notes
  newGridObj[`bar${barNum}_split`] = false; // Reset split status

  // Regenerate and replace
  bar.outerHTML = window.generateBarHTML(barNum, newGridObj);
  window.closePopup();
};

// Called after every edit action (name kept from the old floating popup).
// The sidebar stays open; just re-sync it with the (possibly re-rendered) cells.
window.closePopup = function () { syncSelection(); };
