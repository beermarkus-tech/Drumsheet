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

// --- INITIALIZATION ---
window.onload = function() {
  // 1. Generate Grid Headers
  if(typeof generateHeaderBeats === 'function') {
      generateHeaderBeats('header-beats-1');
      generateHeaderBeats('header-beats-2');
  }

  // 2. Edit sidebar starts with nothing selected; edits autosave
  clearSelection();
  initCellSelection();
  initAutosave();
  // Rows added/removed change which rows a bar group covers
  new MutationObserver(() => refreshBarGroups()).observe(document.getElementById('rows-container'), { childList: true });

  // 3. Register service worker for PWA install / offline shell
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed:', err));
  }

  // 4. Load Config from Firestore (independent of the above — a Firebase
  // failure here shouldn't block the rest of the UI from working), then reopen
  // the song that was open last time
  (async () => {
    await window.firebaseReady;
    try {
      configData = await window.Firebase.getConfig();
    } catch (e) {
      console.error('Failed to load config from Firestore:', e);
    }
    await restoreLastSong();
  })();
};

// --- LAST OPEN SONG ---
// Remembered per device (localStorage) and reopened on the next launch.
const LAST_SONG_KEY = 'drumsheet.lastSongId';

function rememberLastSong(id) {
  try { localStorage.setItem(LAST_SONG_KEY, id); } catch (e) {}
}

async function restoreLastSong() {
  let id = null;
  try { id = localStorage.getItem(LAST_SONG_KEY); } catch (e) {}
  if (!id || currentSongMeta.id) return;
  try {
    const songData = await window.Firebase.loadSong(id);
    if (!currentSongMeta.id) loadEditor(songData); // user may have opened one meanwhile
  } catch (e) {
    console.warn('Could not reopen last song:', e);
    // Forget it only if it's really gone (not when merely offline)
    if (e.message === 'Song not found.') { try { localStorage.removeItem(LAST_SONG_KEY); } catch (e2) {} }
  }
}

// --- RELOAD (load the latest build without closing the app) ---
async function reloadApp() {
  const btn = document.getElementById('reloadBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Updating…';
  try { await flushSave(); } catch (e) {}
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.update();
      // A new build installs (fetching all files fresh) and activates right away
      // (skipWaiting in sw.js); wait for that before reloading.
      const sw = reg.installing || reg.waiting;
      if (sw) {
        await new Promise(resolve => {
          if (sw.state === 'activated') return resolve();
          sw.addEventListener('statechange', () => {
            if (sw.state === 'activated' || sw.state === 'redundant') resolve();
          });
          setTimeout(resolve, 15000);
        });
      }
    }
  } catch (e) {
    console.warn('Update check failed, reloading anyway:', e);
  }
  location.reload();
}

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', function(e) {
  // CTRL + S = save now (works everywhere, also while typing; stops the
  // browser's "Save page" dialog)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    flushSave();
    return;
  }

  // 1. GUARD CLAUSE: Do nothing if typing in an input or textarea
  // This allows normal copy/paste of text in Lyrics and Popup Comment
  const activeTag = document.activeElement.tagName.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea') return;

  // 2. SHORTCUTS (Only active when NOT typing; in text fields the browser's
  // own undo applies)

  // CTRL + Z = Undo, CTRL + Y / CTRL + SHIFT + Z = Redo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoEdit(); else undoEdit();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoEdit();
    return;
  }

  // CTRL + C = Copy Bar
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (activeCell) {
      copyBar();
      // Visual feedback
      activeCell.style.outline = "2px solid blue";
      setTimeout(() => activeCell.style.outline = "", 200);
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
// Config edits preview live in the editor (e.g. structure colors). Close
// without saving reverts them; renames are applied to the open song on save.
let configBackup = null;
const structureOrigName = new WeakMap();

function openConfigModal() {
  configBackup = JSON.parse(JSON.stringify(configData));
  configData.structures.forEach(s => structureOrigName.set(s, s.name));
  document.getElementById('configModal').style.display = 'flex';
  renderStructureRows(); renderSymbolRows();
}

function cancelConfiguration() {
  if (configBackup) configData = configBackup;
  configBackup = null;
  closeModal('configModal');
  refreshEditorStructures();
}

function applyConfigurationToEditor() {
  const renames = {};
  configData.structures.forEach(s => {
    const orig = structureOrigName.get(s);
    if (orig !== undefined && orig !== '' && orig !== s.name) renames[orig] = s.name;
  });
  configBackup = null;
  refreshEditorStructures(renames);
}

// Rebuild every row's structure dropdown and colors from configData. A row whose
// structure no longer exists keeps its value (shown as-is) so nothing is lost.
function refreshEditorStructures(renames = {}) {
  document.querySelectorAll('#rows-container .editor-row').forEach(row => {
    const select = row.querySelector('.struct-select');
    let value = select.value;
    if (renames[value] !== undefined) value = renames[value];

    const known = configData.structures.find(s => s.name === value);
    let options = `<option value="">-</option>`;
    configData.structures.forEach(s => {
      options += `<option value="${escapeHtml(s.name)}" style="color:${escapeHtml(s.color)}">${escapeHtml(s.name)}</option>`;
    });
    if (value && !known) options += `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;

    if (select.innerHTML !== options) select.innerHTML = options;
    select.value = value;
    const color = known ? known.color : 'black';
    if (select.style.color !== color) select.style.color = color;
    const lyrics = row.querySelector('.lyrics-input');
    if (lyrics.style.color !== color) lyrics.style.color = color;
  });
  refreshBarGroups();
}
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
function addStructureRow() { configData.structures.push({ name: '', color: '#000000' }); renderStructureRows(); refreshEditorStructures(); }
function updateStructure(idx, f, v) { configData.structures[idx][f] = v; renderStructureRows(); refreshEditorStructures(); }
function deleteStructure(idx) { configData.structures.splice(idx, 1); renderStructureRows(); refreshEditorStructures(); }
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
