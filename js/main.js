// --- GLOBAL VARIABLES ---
let configData = { structures: [], symbols: [] };
let currentSongMeta = {};

const STRUCTURE_COLORS = [
  { name: 'Black', hex: '#000000' }, { name: 'Blue', hex: '#0000FF' },
  { name: 'Red', hex: '#FF0000' }, { name: 'Dark Green', hex: '#006400' }, { name: 'Magenta', hex: '#FF00FF' }
];
const SYMBOL_COLORS = [
  { name: 'White', hex: '#FFFFFF' }, { name: 'Light Red', hex: '#FFCCCC' }, { name: 'Light Orange', hex: '#FFE5CC' },
  { name: 'Light Yellow', hex: '#FFFFCC' }, { name: 'Light Green', hex: '#E5FFCC' }, { name: 'Mint', hex: '#CCFFCC' },
  { name: 'Cyan', hex: '#CCFFFF' }, { name: 'Light Blue', hex: '#CCE5FF' }, { name: 'Lavender', hex: '#E5CCFF' },
  { name: 'Light Pink', hex: '#FFCCFF' }, { name: 'Grey', hex: '#E0E0E0' }
];

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
      <input type="text" placeholder="Name" value="${s.name}" onchange="updateStructure(${index}, 'name', this.value)">
      <select class="color-select" onchange="updateStructure(${index}, 'color', this.value)" style="background-color:${s.color}; color:${getTextColorForBg(s.color)}">
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
      <input type="text" placeholder="Sym" value="${s.symbol}" style="max-width:50px" onchange="updateSymbol(${index}, 'symbol', this.value)">
      <input type="text" placeholder="Meaning" value="${s.meaning}" onchange="updateSymbol(${index}, 'meaning', this.value)">
      <select class="color-select" onchange="updateSymbol(${index}, 'color', this.value)" style="background-color:${s.color}">
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

// --- VIEW CONTROLS ---
let is16thVisible = true;

function toggle16thView() {
  is16thVisible = !is16thVisible;

  const body = document.body;
  const btn = document.getElementById('btn-toggle-16');
  const span = btn.querySelector('span:nth-child(2)'); // The text span

  if (is16thVisible) {
      body.classList.remove('hide-16th');
      span.innerText = "Hide 16th";
      btn.querySelector('.material-icons').innerText = "grid_on";
  } else {
      body.classList.add('hide-16th');
      span.innerText = "Show 16th";
      btn.querySelector('.material-icons').innerText = "grid_off";
  }
}
