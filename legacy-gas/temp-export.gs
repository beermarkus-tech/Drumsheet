/**
 * TEMPORARY MIGRATION HELPER — DrumScribe -> Firebase
 *
 * Paste this file's contents into your bound Apps Script project (Extensions >
 * Apps Script), alongside the existing Code.gs, then reload the Sheet. A new
 * "DrumScribe Migration" menu appears — use it to export everything as one
 * JSON blob, shown in a copyable dialog (not written into a cell, since a
 * single cell caps out around 50,000 characters and this can exceed that).
 *
 * Safe to delete this whole file (and reload the sheet) once migration is done.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DrumScribe Migration')
    .addItem('Export All Data (for Firebase)', 'exportAllDataDialog')
    .addToUi();
}

function exportAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Config (reuses the existing loadConfig() from Code.gs)
  const config = loadConfig();

  // 2. Every song sheet
  const songs = [];
  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Config') return;

    const data = sheet.getDataRange().getValues();
    const meta = {
      title: (data[0] && data[0][0]) ? data[0][0] : name,
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

    songs.push({ meta: meta, rows: rows });
  });

  return { config: config, songs: songs };
}

function exportAllDataDialog() {
  const payload = JSON.stringify(exportAllData());

  const html = HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif; font-size:13px;">' +
    'The text below is pre-selected. Copy it (Ctrl/Cmd+C) and paste it back to Claude.</p>' +
    '<textarea id="out" style="width:100%; height:420px; font-family:monospace; font-size:11px; box-sizing:border-box;" readonly>' +
    payload.replace(/</g, '&lt;') +
    '</textarea>' +
    '<script>' +
    'const ta = document.getElementById("out"); ta.focus(); ta.select();' +
    '</script>'
  ).setWidth(600).setHeight(520);

  SpreadsheetApp.getUi().showModalDialog(html, 'Export All Data');
}
