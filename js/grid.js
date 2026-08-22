let activeCell = null;
let clipboardBar = null; // Holds the copied bar data

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
        structOptions += `<option value="${s.name}" style="color:${s.color}" ${selected}>${s.name}</option>`;
      });
  }

  div.innerHTML = `
    <div class="col-struct">
        <select class="struct-select" style="color:${currentColor}" onchange="onStructureChange(this)">
          ${structOptions}
        </select>
    </div>

    <div class="col-lyrics">
        <input type="text" class="lyrics-input" value="${data.lyrics}" style="color:${currentColor}" placeholder="Lyrics...">
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
          if (cellData.color) style += ` background-color:${cellData.color};`;

          let content = cellData.sym || cellData.text || '';
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
      html += `<div class="grid-tick${strong ? ' strong' : ''}" style="left:${(k / 16) * 100}%;"></div>`;
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
};

window.insertRow = function (btn) { window.addEditorRow(undefined, btn.closest('.editor-row')); };
window.deleteRow = function (btn) { btn.closest('.editor-row').remove(); };

// --- POPUP LOGIC ---
window.onCellClick = function (event, cell) {
  event.stopPropagation();
  activeCell = cell;

  // 1. POPULATE SYMBOLS (Standard)
  const wrapper = document.getElementById('popup-split-wrapper');
  if (!wrapper) {
      // If wrapper doesn't exist yet (first run), create the container structure dynamically
      const oldContainer = document.getElementById('popup-symbols');
      const parent = oldContainer.parentNode;

      // Create the new layout HTML
      const newLayout = document.createElement('div');
      newLayout.className = 'popup-content-row';
      newLayout.id = 'popup-split-wrapper';

      // Create Left Col (Symbols)
      const symCol = document.createElement('div');
      symCol.className = 'symbol-list';
      symCol.id = 'popup-symbols'; // Keep old ID for compatibility

      // Create Right Col (Colors)
      const colCol = document.createElement('div');
      colCol.className = 'color-list';
      colCol.id = 'popup-colors';

      newLayout.appendChild(symCol);
      newLayout.appendChild(colCol);

      // Swap old for new
      parent.replaceChild(newLayout, oldContainer);
  }

  // A. Generate Symbols (Left)
  const symContainer = document.getElementById('popup-symbols');
  symContainer.innerHTML = '';
  if(configData.symbols) {
      configData.symbols.forEach(s => {
          const row = document.createElement('div');
          row.className = 'symbol-row';
          row.onclick = () => window.selectSymbol(s);
          row.innerHTML = `<div class="symbol-preview" style="background-color:${s.color}">${s.symbol}</div><div class="symbol-meaning">${s.meaning}</div>`;
          symContainer.appendChild(row);
      });
  }

  // B. Generate Colors (Right)
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

  // 2. Palette Colors
  if(typeof PALETTE !== 'undefined') {
      PALETTE.forEach(c => {
          const div = document.createElement('div');
          div.className = 'color-swatch';

          // Use LIGHT color for background selection
          div.style.backgroundColor = c.light;
          div.title = c.name;

          div.onclick = () => window.selectBackgroundColor(c.light);

          colContainer.appendChild(div);
      });
  }

  // 2. POPULATE TEXT (Standard)
  document.getElementById('popup-comment').value = cell.innerText;

  // 3. HIGHLIGHT SUBDIVISION (Standard)
  const currentBar = cell.closest('.bar-container');
  const currentSubd = parseInt(currentBar.getAttribute('data-subd')) || 8;
  document.querySelectorAll('.subd-btn').forEach(btn => {
      btn.classList.remove('active');
      if(parseInt(btn.dataset.val) === currentSubd) btn.classList.add('active');
  });

  // 4. SHOW POPUP (Hidden first to calculate dimensions)
  const popup = document.getElementById('cellPopup');
  popup.style.display = 'flex';

  // --- POSITIONING LOGIC ---

  const currentRow = currentBar.closest('.editor-row');
  const popupRect = popup.getBoundingClientRect();
  const buffer = 10;

  // A. DETERMINE TARGET BAR (Opposite side)
  // If we are in Bar 1 (Left), target is Bar 2. If in Bar 2, target is Bar 1.
  const isBar1 = currentBar.id.includes('bar-1');
  const targetBarId = isBar1 ? '#bar-2' : '#bar-1';
  const targetBar = currentRow.querySelector(targetBarId);

  let leftPos = 0;
  let topPos = 0;

  // B. CALCULATE HORIZONTAL (Center over target bar)
  if (targetBar) {
      const targetRect = targetBar.getBoundingClientRect();
      // Center of target bar - Half of popup width
      leftPos = targetRect.left + (targetRect.width / 2) - (popupRect.width / 2);
  } else {
      // Fallback if bar 2 doesn't exist (rare edge case): Center screen
      leftPos = (window.innerWidth / 2) - (popupRect.width / 2);
  }

  // C. CALCULATE VERTICAL (Center on Mouse Y)
  topPos = event.clientY - (popupRect.height / 2);

  // D. VERTICAL CLAMP (Prevent going off-screen)
  if (topPos < buffer) {
      topPos = buffer;
  }
  if (topPos + popupRect.height > window.innerHeight - buffer) {
      topPos = window.innerHeight - popupRect.height - buffer;
  }

  // Apply
  popup.style.left = leftPos + 'px';
  popup.style.top = topPos + 'px';
};

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

window.closePopup = function () { document.getElementById('cellPopup').style.display = 'none'; };
