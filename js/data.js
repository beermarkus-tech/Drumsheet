let songListCache = [];

async function saveConfiguration() {
  const btn = document.querySelector('#configModal .modal-footer .primary');
  const originalText = btn.innerText;
  btn.innerText = 'Saving...';
  await window.firebaseReady;
  try {
    await window.Firebase.saveConfig(configData);
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
    tr.innerHTML = `<td>${song.band}</td><td>${song.title}</td>`;
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
  try {
    const songData = await window.Firebase.loadSong(id);
    closeModal('loadSongModal');
    loadEditor(songData);
  } catch (e) { alert("Error: " + e.message); }
}

function loadEditor(songData) {
  if (!songData) return;
  currentSongMeta = songData.meta;

  document.getElementById('disp-title').value = songData.meta.title;
  document.getElementById('disp-band').value = songData.meta.band;
  document.getElementById('disp-bpm').value = songData.meta.bpm;

  document.getElementById('editor-view').style.display = 'flex';
  document.getElementById('saveSongBtn').style.display = 'flex';

  const container = document.getElementById('rows-container');
  container.innerHTML = '';

  if (songData.rows && songData.rows.length > 0) {
    for (const row of songData.rows) window.addEditorRow(row);
  } else {
    window.addEditorRow();
  }
}

async function saveCurrentSong() {
  const rows = [];
  document.querySelectorAll('.editor-row').forEach(row => {
      const gridData = {};

      // 1. Scrape Cells
      row.querySelectorAll('.grid-cell').forEach(cell => {
          if(cell.innerText || cell.style.backgroundColor) {
              gridData[cell.id] = { sym: cell.innerText, color: cell.style.backgroundColor };
          }
      });

      // 2. Scrape Subdivision State
      const bar1 = row.querySelector('#bar-1');
      const bar2 = row.querySelector('#bar-2');
      if(bar1) gridData['bar1_subd'] = bar1.getAttribute('data-subd');
      if(bar2) gridData['bar2_subd'] = bar2.getAttribute('data-subd');

      rows.push({
          structure: row.querySelector('.struct-select').value,
          lyrics: row.querySelector('.lyrics-input').value,
          gridData: JSON.stringify(gridData)
      });
  });

  const btn = document.getElementById('saveSongBtn');
  const originalText = btn.innerHTML;
  btn.innerText = 'Saving...';

  await window.firebaseReady;
  try {
    await window.Firebase.saveSongRows(currentSongMeta.id, rows);
    btn.innerText = 'Saved!';
  } catch (e) {
    alert('Error saving song: ' + e.message);
  }
  setTimeout(() => btn.innerHTML = originalText, 1000);
}

async function saveSongMetadata() {
  const newMeta = {
    title: document.getElementById('disp-title').value,
    band: document.getElementById('disp-band').value,
    bpm: document.getElementById('disp-bpm').value,
    beat: currentSongMeta.beat || '4/4'
  };

  if (!newMeta.title) return alert("Title cannot be empty");

  const btn = document.getElementById('btn-update-meta');
  const originalText = btn.innerHTML;
  btn.innerText = 'Updating...';
  btn.disabled = true;

  await window.firebaseReady;
  try {
    const savedMeta = await window.Firebase.updateSongMeta(currentSongMeta.id, newMeta);
    // Update global state with new title (crucial for future saves)
    currentSongMeta = savedMeta;

    btn.innerHTML = '<span class="material-icons" style="font-size: 14px;">check</span> Saved';
  } catch (e) {
    alert("Error updating info: " + e.message);
  }
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }, 1500);
}
