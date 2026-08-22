/**
 * SERVES THE WEB APP
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('DrumScribe V1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * HELPER: Includes HTML content from another file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
    .getContent();
}

/**
 * CONFIGURATION LOGIC
 */
function setupConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.appendRow(['Type', 'Key', 'Label', 'Color']); 
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function loadConfig() {
  const sheet = setupConfigSheet();
  const data = sheet.getDataRange().getValues();
  data.shift(); // Remove header
  
  const config = { structures: [], symbols: [] };

  data.forEach(row => {
    if (row[0] === 'Structure') {
      config.structures.push({ name: row[1], color: row[3] });
    } else if (row[0] === 'Symbol') {
      config.symbols.push({ symbol: row[1], meaning: row[2], color: row[3] });
    }
  });
  return config;
}

function saveConfig(configData) {
  const sheet = setupConfigSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  
  const rows = [];
  configData.structures.forEach(s => rows.push(['Structure', s.name, '', s.color]));
  configData.symbols.forEach(s => rows.push(['Symbol', s.symbol, s.meaning, s.color]));
  
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  return true;
}

/**
 * SONG MANAGEMENT LOGIC
 */
function createNewSong(meta) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (ss.getSheetByName(meta.title)) {
    throw new Error('A song with this title already exists.');
  }
  
  const sheet = ss.insertSheet(meta.title);
  sheet.appendRow([meta.title, meta.band, meta.bpm, meta.beat]);
  sheet.appendRow(['Structure', 'Lyrics', 'GridData']);
  sheet.setFrozenRows(2);
  
  const emptyRowsForSheet = [];
  const rowsForFrontend = [];
  
  for(let i=0; i<40; i++) {
    emptyRowsForSheet.push(['', '', '{}']);
    rowsForFrontend.push({ structure: '', lyrics: '', gridData: '{}' });
  }
  
  sheet.getRange(3, 1, 40, 3).setValues(emptyRowsForSheet);
  
  return { meta: meta, rows: rowsForFrontend };
}

function getSongList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const songs = [];
  
  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name !== 'Config') {
      const band = sheet.getRange(1, 2).getValue(); 
      songs.push({ title: name, band: band });
    }
  });
  return songs;
}

function loadSong(title) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(title);
  if (!sheet) throw new Error('Song sheet "' + title + '" not found.');
  
  const data = sheet.getDataRange().getValues();
  
  const meta = {
    title: (data[0] && data[0][0]) ? data[0][0] : title,
    band: (data[0] && data[0][1]) ? data[0][1] : '',
    bpm: (data[0] && data[0][2]) ? data[0][2] : '',
    beat: (data[0] && data[0][3]) ? data[0][3] : '4/4'
  };
  
  const rows = [];
  if (data.length > 2) {
    for (let i = 2; i < data.length; i++) {
      rows.push({
        structure: String(data[i][0] || ''),
        lyrics: String(data[i][1] || ''),
        gridData: String(data[i][2] || '{}')
      });
    }
  }
  
  return JSON.stringify({ meta: meta, rows: rows });
}

function saveSongContent(title, rowsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(title);
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) sheet.getRange(3, 1, lastRow - 2, 3).clearContent();
  
  const dbRows = rowsData.map(r => [r.structure, r.lyrics, r.gridData]);
  if (dbRows.length > 0) sheet.getRange(3, 1, dbRows.length, 3).setValues(dbRows);
  return true;
}

function updateSongMetadata(oldTitle, newMeta) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(oldTitle);
  
  if (!sheet) throw new Error('Original song sheet not found.');
  
  // 1. Rename Sheet if title changed
  if (oldTitle !== newMeta.title) {
    if (ss.getSheetByName(newMeta.title)) {
      throw new Error('A song with the new title already exists.');
    }
    sheet.setName(newMeta.title);
  }
  
  // 2. Update Metadata Row (Row 1)
  // Columns: Title, Band, BPM, Beat
  sheet.getRange(1, 1, 1, 4).setValues([[newMeta.title, newMeta.band, newMeta.bpm, newMeta.beat]]);
  
  return newMeta;
}