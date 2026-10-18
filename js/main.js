// --- GLOBAL VARIABLES ---
let configData = { structures: [], symbols: [] };
let currentSongMeta = {};

// Escape user/stored text before interpolating it into an innerHTML template, so
// quotes, '<' and '&' in lyrics, titles, symbols etc. show up literally instead of
// truncating attribute values or being parsed as markup.
function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STRUCTURE_COLORS = [
  { name: 'Black', hex: '#000000' }, { name: 'Blue', hex: '#0000FF' },
  { name: 'Red', hex: '#FF0000' }, { name: 'Dark Green', hex: '#006400' }, { name: 'Magenta', hex: '#FF00FF' }
];

// --- PALETTE DEFINITION ---
const PALETTE = [
  { name: 'White',  strong: '#d9d9d9',  light: '#ffffff' },
  { name: 'Red',    strong: '#ea9999',  light: '#f4cccc' },
  { name: 'Orange', strong: '#f9cb9c',  light: '#fce5cd' },
  { name: 'Yellow', strong: '#ffe599',  light: '#fff2cc' },
  { name: 'Green',  strong: '#b6d7a8',  light: '#d9ead3' },
  { name: 'Mint',   strong: '#a2c4c9',  light: '#d0e0e3' },
  { name: 'Cyan',   strong: '#9fc5e8',  light: '#cfe2f3' },
  { name: 'Blue',   strong: '#a4c2f4',  light: '#c9daf8' },
  { name: 'Purple', strong: '#b4a7d6',  light: '#b4a7d6' },
  { name: 'Pink',   strong: '#d5a6bd',  light: '#ead1dc' },
  { name: 'Grey',   strong: '#cccccc',  light: '#efefef' },
];

// Mapped for backward compatibility with Config Modal (Symbols use Strong colors)
const SYMBOL_COLORS = PALETTE.map(p => ({ name: p.name, hex: p.strong }));

// Placeholder for an "unsaved changes" indicator feature; grid.js calls this
// on background-color edits and ghost-pastes but nothing currently renders it.
window.markUnsaved = function () {};

// --- INITIALIZATION ---
window.onload = function() {
  // 1. Generate Grid Headers
  if(typeof generateHeaderBeats === 'function') {
      generateHeaderBeats('header-beats-1');
      generateHeaderBeats('header-beats-2');
  }

  // 2. Popup Closer
  document.addEventListener('click', function(e) {
    const popup = document.getElementById('cellPopup');
    // Close if clicking outside popup AND outside grid cells
    if (popup.style.display !== 'none' && !popup.contains(e.target) && !e.target.classList.contains('grid-cell')) {
      closePopup();
    }
  });

  // 3. Register service worker for PWA install / offline shell
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed:', err));
  }

  // 4. Load Config from Firestore (independent of the above — a Firebase
  // failure here shouldn't block the rest of the UI from working)
  (async () => {
    await window.firebaseReady;
    try {
      configData = await window.Firebase.getConfig();
    } catch (e) {
      console.error('Failed to load config from Firestore:', e);
    }
  })();
};

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', function(e) {
  // 1. GUARD CLAUSE: Do nothing if typing in an input or textarea
  // This allows normal copy/paste of text in Lyrics and Popup Comment
  const activeTag = document.activeElement.tagName.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea') return;

  // 2. SHORTCUTS (Only active when NOT typing)

  // CTRL + C = Copy Bar
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (activeCell) {
      copyBar();
      // Visual feedback
      activeCell.style.outline = "2px solid blue";
      setTimeout(() => activeCell.style.outline = "none", 200);
    }
  }

  // CTRL + SHIFT + V = Ghost Paste (Repeat)
  // (Check Shift first because 'V' matches both v and V)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault(); // Stop browser from doing anything weird
    if (activeCell && clipboardBar) {
      pasteRepeat();
    }
    return;
  }

  // CTRL + V = Paste Bar (Standard)
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    // We do NOT preventDefault here generally, but since we have the Guard Clause above,
    // we know we are NOT in an input. So it is safe to hijack it for the Grid.
    e.preventDefault();
    if (activeCell && clipboardBar) {
      pasteBar();
    }
  }
});

// --- MODAL UTILS ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openConfigModal() { document.getElementById('configModal').style.display = 'flex'; renderStructureRows(); renderSymbolRows(); }
function openNewSongModal() {
  document.getElementById('new-title').value = '';
  document.getElementById('new-band').value = '';
  document.getElementById('new-bpm').value = '';
  document.getElementById('newSongModal').style.display = 'flex';
}
function openLoadSongModal() {
  document.getElementById('loadSongModal').style.display = 'flex';
  loadSongList();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// --- CONFIG UI ---
function renderStructureRows() {
  const container = document.getElementById('structure-list');
  container.innerHTML = '';
  configData.structures.forEach((s, index) => {
    const div = document.createElement('div');
    div.className = 'config-row';
    div.innerHTML = `
      <input type="text" placeholder="Name" value="${escapeHtml(s.name)}" onchange="updateStructure(${index}, 'name', this.value)">
      <select class="color-select" onchange="updateStructure(${index}, 'color', this.value)" style="background-color:${escapeHtml(s.color)}; color:${getTextColorForBg(s.color)}">
        ${generateColorOptions(STRUCTURE_COLORS, s.color)}
      </select>
      <span class="material-icons" onclick="deleteStructure(${index})" style="cursor:pointer; color:red;">delete</span>`;
    container.appendChild(div);
  });
}

function renderSymbolRows() {
  const container = document.getElementById('symbol-list');
  container.innerHTML = '';
  configData.symbols.forEach((s, index) => {
    const div = document.createElement('div');
    div.className = 'config-row';
    div.innerHTML = `
      <input type="text" placeholder="Sym" value="${escapeHtml(s.symbol)}" style="max-width:50px" onchange="updateSymbol(${index}, 'symbol', this.value)">
      <input type="text" placeholder="Meaning" value="${escapeHtml(s.meaning)}" onchange="updateSymbol(${index}, 'meaning', this.value)">
      <select class="color-select" onchange="updateSymbol(${index}, 'color', this.value)" style="background-color:${escapeHtml(s.color)}">
         ${generateColorOptions(SYMBOL_COLORS, s.color)}
      </select>
      <span class="material-icons" onclick="deleteSymbol(${index})" style="cursor:pointer; color:red;">delete</span>`;
    container.appendChild(div);
  });
}

// Config Helpers
function addStructureRow() { configData.structures.push({ name: '', color: '#000000' }); renderStructureRows(); }
function updateStructure(idx, f, v) { configData.structures[idx][f] = v; renderStructureRows(); }
function deleteStructure(idx) { configData.structures.splice(idx, 1); renderStructureRows(); }
function addSymbolRow() { configData.symbols.push({ symbol: '', meaning: '', color: '#FFFFFF' }); renderSymbolRows(); }
function updateSymbol(idx, f, v) { configData.symbols[idx][f] = v; renderSymbolRows(); }
function deleteSymbol(idx) { configData.symbols.splice(idx, 1); renderSymbolRows(); }

function generateColorOptions(palette, selectedColor) {
  return palette.map(c => `<option value="${c.hex}" ${c.hex === selectedColor ? 'selected' : ''} style="background-color:${c.hex}">${c.name}</option>`).join('');
}
function getTextColorForBg(hex) {
  if(['#000000', '#0000FF', '#006400', '#FF0000', '#FF00FF'].includes(hex)) return 'white';
  return 'black';
}
