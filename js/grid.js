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

window.refreshBarGroups = function () {
  const rows = [...document.querySelectorAll('#rows-container .editor-row')];
  const groups = computeBarGroups(rows.map(r => ({
    bars: r.querySelector('.bars-btn').dataset.bars,
    struct: r.querySelector('.struct-select').value
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
      html += `<div class="grid-tick${strong ? ' strong' : eighth ? ' eighth' : ''}" style="left:${(k / 16) * 100}%;"></div>`;
  }
  html += '</div>';
  return html;
}

window.toggleSplit = function () {
  if(!activeCell) return;
  const bar = activeCell.closest('.bar-container');
  const barNum = bar.id.split('-')[1];

  // 1. Get current state
  const currentSplit = bar.getAttribute('data-split') === 'true';
  const newSplit = !currentSplit;

  // 2. Scrape data to preserve it during re-render
  const gridObj = {};

  // Capture subd/split state
  gridObj[`bar${barNum}_subd`] = bar.getAttribute('data-subd');
  gridObj[`bar${barNum}_split`] = newSplit; // Apply toggle

  // Capture existing cell data
  bar.querySelectorAll('.grid-cell').forEach(cell => {
      if(cell.innerText || cell.style.backgroundColor) {
          gridObj[cell.id] = { sym: cell.innerText, color: cell.style.backgroundColor };
      }
  });

  // 3. Regenerate
  bar.outerHTML = window.generateBarHTML(barNum, gridObj);
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

// --- EDIT SIDEBAR LOGIC ---
// The edit panel (#cellPopup) is a permanent sidebar. Clicking a cell selects
// it; the selection survives edits, including ones that re-render the bar
// (subdivision, split, paste, clear bar) — see syncSelection().
let activeRef = null; // { row, barNum, aux, idx } — where the selection lives

window.onCellClick = function (event, cell) {
  event.stopPropagation();
  selectCell(cell);
};

function selectCell(cell) {
  if (activeCell && activeCell !== cell) activeCell.classList.remove('cell-selected');
  activeCell = cell;
  cell.classList.add('cell-selected');

  const bar = cell.closest('.bar-container');
  activeRef = {
      row: cell.closest('.editor-row'),
      barNum: bar.id.split('-')[1],
      aux: cell.id.startsWith('aux_'),
      idx: parseInt(cell.id.split('_c')[1])
  };

  populateSidebarLists();

  // Cell text
  document.getElementById('popup-comment').value = cell.innerText;

  // Highlight subdivision
  const currentSubd = parseInt(bar.getAttribute('data-subd')) || 8;
  document.querySelectorAll('.subd-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val) === currentSubd);
  });

  // Selection label, e.g. "Row 3 · Bar 1 · 2&"
  const rowNum = [...document.querySelectorAll('#rows-container .editor-row')].indexOf(activeRef.row) + 1;
  const COUNTS = ['', 'e', '&', 'a'];
  const pos = activeRef.idx - 1;
  const beat = `${Math.floor(pos / 4) + 1}${COUNTS[pos % 4]}`;
  document.getElementById('sidebar-selection').textContent =
      `Row ${rowNum} · Bar ${activeRef.barNum} · ${beat}${activeRef.aux ? ' (aux)' : ''}`;

  document.getElementById('cellPopup').classList.remove('no-selection');
}

function clearSelection() {
  if (activeCell) activeCell.classList.remove('cell-selected');
  activeCell = null;
  activeRef = null;
  document.getElementById('popup-comment').value = '';
  document.querySelectorAll('.subd-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('sidebar-selection').textContent = 'Click a cell to edit it';
  document.getElementById('cellPopup').classList.add('no-selection');
}
window.clearSelection = clearSelection;

// After an action, re-attach the selection: if the bar was re-rendered the old
// cell element is gone, so pick the cell now covering the same 16th position
// (falling back to the main lane if the aux lane no longer exists).
function syncSelection() {
  if (!activeCell) return;
  if (activeCell.isConnected) { selectCell(activeCell); return; }
  if (!activeRef || !activeRef.row.isConnected) { clearSelection(); return; }

  const bar = activeRef.row.querySelector(`#bar-${activeRef.barNum}`);
  const cells = [...bar.querySelectorAll('.grid-cell')];
  let lane = cells.filter(c => c.id.startsWith('aux_') === activeRef.aux);
  if (lane.length === 0) lane = cells.filter(c => !c.id.startsWith('aux_'));
  let best = lane[0];
  lane.forEach(c => { if (parseInt(c.id.split('_c')[1]) <= activeRef.idx) best = c; });
  if (best) selectCell(best); else clearSelection();
}

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

  // 2. Palette Colors (LIGHT color for backgrounds)
  if(typeof PALETTE !== 'undefined') {
      PALETTE.forEach(c => {
          const div = document.createElement('div');
          div.className = 'color-swatch';
          div.style.backgroundColor = c.light;
          div.title = c.name;
          div.onclick = () => window.selectBackgroundColor(c.light);
          colContainer.appendChild(div);
      });
  }
}

window.selectSymbol = function (s) {
  if(activeCell) {
      activeCell.innerText = s.symbol;
      activeCell.style.backgroundColor = s.color;
      window.closePopup();
  }
};

window.applyText = function () {
  if(activeCell) {
      activeCell.innerText = document.getElementById('popup-comment').value;
      window.closePopup();
  }
};

window.selectBackgroundColor = function (hex) {
  if(activeCell) {
      activeCell.style.backgroundColor = hex;
      window.closePopup();
      window.markUnsaved();
  }
};

window.changeSubdivision = function (newSubd) {
  if(!activeCell) return;
  const bar = activeCell.closest('.bar-container');
  const row = bar.closest('.editor-row');
  const barNum = bar.id.split('-')[1];

  // Scrape current data
  const gridData = {};
  row.querySelectorAll('.grid-cell').forEach(cell => {
      if(cell.innerText || cell.style.backgroundColor) {
          gridData[cell.id] = { sym: cell.innerText, color: cell.style.backgroundColor };
      }
  });

  // Update Subd
  gridData[`bar${barNum}_subd`] = newSubd;

  // Regenerate and Replace
  bar.outerHTML = window.generateBarHTML(barNum, gridData);
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
  if(activeCell) {
      activeCell.innerText = '';
      activeCell.style.backgroundColor = '';
      window.closePopup();
  }
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
// The sidebar stays open; just re-sync it with the (possibly re-rendered) cell.
window.closePopup = function () { syncSelection(); };
