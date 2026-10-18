let songListCache = [];

async function saveConfiguration() {
  const btn = document.querySelector('#configModal .modal-footer .primary');
  const originalText = btn.innerText;
  btn.innerText = 'Saving...';
  await window.firebaseReady;
  try {
    await window.Firebase.saveConfig(configData);
    applyConfigurationToEditor();
    btn.innerText = 'Saved!';
    setTimeout(() => { closeModal('configModal'); btn.innerText = originalText; }, 500);
  } catch (e) {
    alert('Error saving configuration: ' + e.message);
    btn.innerText = originalText;
  }
}

async function createNewSong() {
  const meta = {
    title: document.getElementById('new-title').value,
    band: document.getElementById('new-band').value,
    bpm: document.getElementById('new-bpm').value,
    beat: '4/4'
  };
  if(!meta.title) return alert('Title is required');

  await window.firebaseReady;
  await flushSave();
  try {
    const data = await window.Firebase.createSong(meta);
    closeModal('newSongModal');
    loadEditor(data);
  } catch (e) {
    alert(e.message);
  }
}

async function loadSongList() {
  const tbody = document.getElementById('song-list-body');
  tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  await window.firebaseReady;
  const list = await window.Firebase.listSongs();
  songListCache = list;
  tbody.innerHTML = '';
  list.forEach(song => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(song.band)}</td><td>${escapeHtml(song.title)}</td>`;
    tr.onclick = () => loadSelectedSong(song.id);
    tbody.appendChild(tr);
  });
}

function sortSongList(field) {
   // Basic sort implementation or reloading from server
   // For now, simple re-render if cached, or just re-fetch
   loadSongList();
}

async function loadSelectedSong(id) {
  await window.firebaseReady;
  await flushSave();
  try {
    const songData = await window.Firebase.loadSong(id);
    closeModal('loadSongModal');
    loadEditor(songData);
  } catch (e) { alert("Error: " + e.message); }
}

function loadEditor(songData) {
  if (!songData) return;
  currentSongMeta = songData.meta;
  rememberLastSong(songData.meta.id);

  document.getElementById('disp-title').value = songData.meta.title ?? '';
  document.getElementById('disp-band').value = songData.meta.band ?? '';
  document.getElementById('disp-bpm').value = songData.meta.bpm ?? '';

  document.getElementById('editor-view').style.display = 'flex';
  document.getElementById('save-status').style.display = 'flex';
  document.getElementById('printBtn').style.display = 'flex';

  document.getElementById('cellPopup').style.display = 'flex';
  clearSelection();

  const container = document.getElementById('rows-container');
  container.innerHTML = '';

  if (songData.rows && songData.rows.length > 0) {
    for (const row of songData.rows) window.addEditorRow(row);
  } else {
    window.addEditorRow();
  }

  // Baseline for autosave: the song as rendered counts as "saved", so just
  // opening a song never writes anything.
  lastSavedJson = JSON.stringify(collectSong());
  lastSavedTitle = songData.meta.title ?? '';
  saveRetryDelay = 0;
  clearTimeout(saveRetryTimer); saveRetryTimer = null;
  setSaveStatus('saved');
}

// --- AUTOSAVE ---
// Every edit in the editor (grid, lyrics, structure, title/band/BPM) schedules a
// save 300ms after the last change. Instead of tracking each edit action, a save
// serializes the whole song and only writes if it differs from what was last
// saved, so stray triggers (e.g. selecting a cell) cost nothing.
const AUTOSAVE_DELAY_MS = 300;
const FLUSH_TIMEOUT_MS = 5000;

let saveTimer = null;        // pending debounced save
let saveInFlight = null;     // promise of the save currently being written
let saveAgain = false;       // an edit arrived while a save was in flight
let saveRetryTimer = null;
let saveRetryDelay = 0;
let lastSavedJson = null;    // collectSong() snapshot of what's in Firestore
let lastSavedTitle = '';

function collectRows() {
  const rows = [];
  document.querySelectorAll('.editor-row').forEach(row => {
      const gridData = {};

      // 1. Scrape Cells
      row.querySelectorAll('.grid-cell').forEach(cell => {
          if(cell.innerText || cell.style.backgroundColor) {
              gridData[cell.id] = { sym: cell.innerText, color: cell.style.backgroundColor };
          }
      });

      // 2. Scrape Subdivision/Split/Repeat State
      const bar1 = row.querySelector('#bar-1');
      const bar2 = row.querySelector('#bar-2');
      if(bar1) {
           gridData['bar1_subd'] = bar1.getAttribute('data-subd');
           gridData['bar1_split'] = bar1.getAttribute('data-split');
           gridData['bar1_repeat'] = bar1.getAttribute('data-repeat');
      }
      if(bar2) {
           gridData['bar2_subd'] = bar2.getAttribute('data-subd');
           gridData['bar2_split'] = bar2.getAttribute('data-split');
           gridData['bar2_repeat'] = bar2.getAttribute('data-repeat');
      }

      rows.push({
          structure: row.querySelector('.struct-select').value,
          lyrics: row.querySelector('.lyrics-input').value,
          gridData: JSON.stringify(gridData)
      });
  });
  return rows;
}

function collectSong() {
  return {
    id: currentSongMeta.id,
    title: document.getElementById('disp-title').value,
    band: document.getElementById('disp-band').value,
    bpm: document.getElementById('disp-bpm').value,
    beat: currentSongMeta.beat || '4/4',
    rows: collectRows()
  };
}

function scheduleSave() {
  if (!currentSongMeta.id) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(runSave, AUTOSAVE_DELAY_MS);
}
// grid.js calls this after some edits; the observers below catch the rest.
window.markUnsaved = scheduleSave;

async function runSave() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!currentSongMeta.id) return;
  if (saveInFlight) { saveAgain = true; return saveInFlight; }
  saveInFlight = writeSong().finally(() => { saveInFlight = null; });
  await saveInFlight;
  if (saveAgain) { saveAgain = false; return runSave(); }
}

async function writeSong() {
  const snap = collectSong();
  const json = JSON.stringify(snap);
  if (json === lastSavedJson) return;

  setSaveStatus(navigator.onLine ? 'saving' : 'offline');

  // Title rules (unique, non-empty) are checked only when it actually changed;
  // if it's invalid, everything else still saves under the previous title.
  const payload = { title: snap.title, band: snap.band, bpm: snap.bpm, beat: snap.beat, rows: snap.rows };
  let warning = null;
  try {
    if (snap.title !== lastSavedTitle) {
      if (!snap.title.trim()) {
        payload.title = lastSavedTitle;
        warning = 'Title can’t be empty – not renamed';
      } else if (await window.Firebase.isTitleTaken(snap.title, snap.id)) {
        payload.title = lastSavedTitle;
        warning = 'Another song already has this title – not renamed';
      }
    }
    await window.Firebase.saveSong(snap.id, payload);
  } catch (e) {
    if (snap.id !== currentSongMeta.id) return; // user moved on; nothing to show
    saveRetryDelay = Math.min(Math.max(saveRetryDelay * 2, 2000), 30000);
    setSaveStatus('error', 'Not saved – retrying (' + e.message + ')');
    clearTimeout(saveRetryTimer);
    saveRetryTimer = setTimeout(() => { saveRetryTimer = null; runSave(); }, saveRetryDelay);
    return;
  }

  // A save that finishes after another song was opened must not touch its state.
  if (snap.id !== currentSongMeta.id) return;
  lastSavedJson = json;
  lastSavedTitle = payload.title;
  currentSongMeta = { ...currentSongMeta, title: payload.title, band: payload.band, bpm: payload.bpm };
  saveRetryDelay = 0;
  if (warning) setSaveStatus('warning', warning);
  else setSaveStatus('saved');
}

// Save right now and wait for it (e.g. before switching songs). Offline,
// Firestore queues the write and its promise only settles once back online, so
// don't block the UI forever — the queued write still lands on the right song.
async function flushSave() {
  if (!currentSongMeta.id) return;
  const done = (async () => { await runSave(); while (saveInFlight) await saveInFlight; })();
  await Promise.race([done, new Promise(r => setTimeout(r, FLUSH_TIMEOUT_MS))]);
}
window.flushSave = flushSave;

function hasUnsavedChanges() {
  if (!currentSongMeta.id) return false;
  return !!(saveInFlight || saveRetryTimer) || JSON.stringify(collectSong()) !== lastSavedJson;
}

const SAVE_STATUS = {
  saved:   { icon: 'cloud_done', text: 'All changes saved' },
  saving:  { icon: 'sync',       text: 'Saving…' },
  offline: { icon: 'cloud_off',  text: 'Offline – will sync when back online' },
  warning: { icon: 'warning',    text: '' },
  error:   { icon: 'error',      text: '' }
};
function setSaveStatus(state, message) {
  const el = document.getElementById('save-status');
  el.className = 'save-status ' + state;
  el.innerHTML = `<span class="material-icons">${SAVE_STATUS[state].icon}</span><span>${escapeHtml(message || SAVE_STATUS[state].text)}</span>`;
}

function initAutosave() {
  const editor = document.getElementById('editor-view');
  // Text fields, structure dropdowns, title/band/BPM
  editor.addEventListener('input', scheduleSave);
  editor.addEventListener('change', scheduleSave);
  // Grid edits (cell text/colors, re-rendered bars, added/deleted rows)
  new MutationObserver(scheduleSave).observe(document.getElementById('rows-container'), {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['style', 'data-subd', 'data-split', 'data-repeat']
  });

  // Write immediately when the app is backgrounded/closed
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') runSave(); });
  window.addEventListener('pagehide', () => runSave());
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) { runSave(); e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('online', () => { if (saveInFlight) setSaveStatus('saving'); runSave(); });
  window.addEventListener('offline', () => { if (saveInFlight || saveTimer) setSaveStatus('offline'); });
}
window.initAutosave = initAutosave;
