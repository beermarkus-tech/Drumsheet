function printSheet() {
  // 1. GATHER DATA
  const meta = {
    title: document.getElementById('disp-title').value || 'Untitled',
    band: document.getElementById('disp-band').value || 'Unknown Band',
    bpm: document.getElementById('disp-bpm').value || '120'
  };

  // 2. SCRAPE ROWS
  const rawRows = [];
  document.querySelectorAll('.editor-row').forEach(row => {
    const structSelect = row.querySelector('.struct-select');
    const lyricsInput = row.querySelector('.lyrics-input');

    // Clone bars
    const bar1 = row.querySelector('#bar-1');
    const bar2 = row.querySelector('#bar-2');

    rawRows.push({
      struct: {
          text: structSelect.options[structSelect.selectedIndex].text,
          color: structSelect.style.color
      },
      lyrics: {
          text: lyricsInput.value,
          color: lyricsInput.style.color
      },
      bar1: bar1.outerHTML.replace(/ cell-selected/g, ''),
      bar2: bar2.outerHTML.replace(/ cell-selected/g, '')
    });
  });

  // 3. GENERATE HEADER ROW
  function getHeaderBarHTML() {
      const counts = ['1', 'e', '&', 'a'];
      let cells = '';
      for (let i = 0; i < 16; i++) {
         const minor = i % 4 !== 0;
         cells += `<div class="grid-cell header-cell${minor ? ' minor' : ''}" style="--slots:1;">${minor ? counts[i % 4] : (i / 4 + 1)}</div>`;
      }
      return `<div class="bar-container header-container">${cells}${generateBarGridlines()}</div>`;
  }

  // Use the editor's grid line colors so the sheet matches the screen
  const rootStyle = getComputedStyle(document.documentElement);
  const lineVar = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const LINE_STRONG = lineVar('--line-strong', '#000000');
  const LINE_DARK = lineVar('--line-dark', '#555555');
  const LINE_LIGHT = lineVar('--line-light', '#bbbbbb');

  // 4. CALCULATE ROWSPANS
  if (rawRows.length > 0) {
    let currentStruct = rawRows[0].struct;
    let currentLyrics = rawRows[0].lyrics.text;
    let structSpan = 1, lyricsSpan = 1;

    rawRows[0].structSpan = 1; rawRows[0].lyricsSpan = 1;

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];

      if (row.struct.text === currentStruct.text && row.struct.text !== '-' && row.struct.text !== '') {
         structSpan++;
         rawRows[i - structSpan + 1].structSpan = structSpan;
         row.structSpan = 0;
      } else {
         currentStruct = row.struct;
         structSpan = 1;
         row.structSpan = 1;
      }

      if (row.lyrics.text === currentLyrics.text && row.lyrics.text !== '') {
         lyricsSpan++;
         rawRows[i - lyricsSpan + 1].lyricsSpan = lyricsSpan;
         row.lyricsSpan = 0;
      } else {
         currentLyrics = row.lyrics.text;
         lyricsSpan = 1;
         row.lyricsSpan = 1;
      }
    }
  }

  // 5. GENERATE PRINT WINDOW
  const printWindow = window.open('', '_blank', 'width=1200,height=900,menubar=yes,toolbar=yes,scrollbars=yes');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(meta.title)}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        body {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          background: #eee;
          margin: 0; padding: 20px 0;
          display: flex; justify-content: center;
        }

        /* --- PAGE PREVIEW (FULL SCREEN) --- */
        .sheet {
          background: white;
          width: 100%; /* Take full width of the window */
          max-width: 210mm; /* But don't exceed A4 width */
          min-height: 297mm;
          padding: 10mm;
          margin: 0 auto; /* Center it */
          box-shadow: 0 0 15px rgba(0,0,0,0.2);
          box-sizing: border-box;
        }

        /* --- HEADER INFO --- */
        .song-header { border-bottom: 2px solid #000; margin-bottom: 15px; padding-bottom: 5px; }
        .song-title { font-size: 24px; font-weight: bold; margin: 0; text-transform: uppercase; }
        .song-meta { margin-top: 5px; font-size: 14px; font-weight: bold; color: #333; }

        /* --- TABLE LAYOUT --- */
        /* Lines mirror the editor: rows are separated by dark grey, the Structure
           and Lyrics columns by light grey, each bar is edged in black (3px, shared
           between bar 1 and 2), quarter-note lines are dark grey and e/&/a lines
           light grey. border-collapse merges touching borders into one line (the
           wider one wins), so nothing is drawn twice. Grid cells themselves have
           no borders; the 16th ruler is an overlay, like on screen. */
        table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid ${LINE_DARK}; }

        col.c-struct { width: 10%; }
        col.c-lyrics { width: 40%; }
        col.c-bar    { width: 25%; }

        tr { height: 28px; }

        /* --- CELLS --- */
        th, td { padding: 0; vertical-align: middle; border: 1px solid ${LINE_DARK}; }
        th {
          background: #ddd; padding: 4px;
          font-size: 11px; text-transform: uppercase; font-weight: bold;
        }
        .th-struct, .td-struct, .th-lyrics, .td-lyrics { border-right: 1px solid #ccc; }
        .th-bar, .td-grid { border-left: 3px solid ${LINE_STRONG}; border-right: 3px solid ${LINE_STRONG}; }

        .td-struct { text-align: center; font-weight: bold; font-size: 12px; padding: 2px; background:#fff; }
        .td-lyrics { padding: 0 5px; font-size: 12px; font-style: italic; white-space: nowrap; overflow: hidden; background:#fff; }
        .td-grid { background: #fff; }

        /* --- GRID INTERNALS --- */
        .bar-container { display: flex; position: relative; width: 100%; height: 28px; }
        .bar-container.header-container { height: 14px; background: #e0e0e0; }
        .bar-container.repeat-mode { opacity: 0.4; filter: grayscale(100%); }

        /* Cells share the bar width in proportion to how many 16ths they span */
        .grid-cell {
          display: flex; justify-content: center; align-items: center;
          flex: var(--slots, 1) 1 0px; min-width: 0;
          font-size: 12px; font-weight: bold;
        }

        /* Always-visible 16th ruler (same markup as the editor) */
        .bar-gridlines { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 2; }
        .grid-tick { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid ${LINE_LIGHT}; }
        .grid-tick.strong { border-left: 2px solid ${LINE_DARK}; }

        /* Header count: 1/2/3/4 bold, e/&/a regular */
        .header-cell { font-size: 9px; color: #333; }
        .header-cell.minor { font-weight: normal; }

        /* --- SPLIT BARS --- */
        .bar-container.split-mode { flex-direction: column; }
        .sub-line { display: flex; flex: 1; width: 100%; min-height: 0; }
        .sub-line.upper { border-bottom: 1px solid ${LINE_LIGHT}; }
        .sub-line .grid-cell { font-size: 10px; }

        /* --- PRINT MEDIA (Standard A4) --- */
        @media print {
          body { background: none; padding: 0; display: block; }
          .sheet { width: 100%; max-width: none; box-shadow: none; padding: 0; margin: 0; }
          tr { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
          <div class="song-header">
              <div class="song-title">${escapeHtml(meta.title)}</div>
              <div class="song-meta">${escapeHtml(meta.band)} &nbsp;|&nbsp; BPM: ${escapeHtml(meta.bpm)}</div>
          </div>

          <table>
            <colgroup>
              <col class="c-struct">
              <col class="c-lyrics">
              <col class="c-bar">
              <col class="c-bar">
            </colgroup>
            <thead>
              <tr style="height: 14px;">
                <th rowspan="2" class="th-struct">Structure</th>
                <th rowspan="2" class="th-lyrics">Lyrics</th>
                <th class="th-bar">Bar 1</th>
                <th class="th-bar">Bar 2</th>
              </tr>
              <tr style="height: 14px;">
                  <td class="td-grid">${getHeaderBarHTML()}</td>
                  <td class="td-grid">${getHeaderBarHTML()}</td>
              </tr>
            </thead>
            <tbody>
              ${rawRows.map(row => {
                let structTd = '';
                if (row.structSpan > 0) {
                   structTd = `<td class="td-struct" rowspan="${row.structSpan}" style="color:${escapeHtml(row.struct.color)}">${row.struct.text === '-' ? '' : escapeHtml(row.struct.text)}</td>`;
                }

                let lyricsTd = '';
                if (row.lyricsSpan > 0) {
                   lyricsTd = `<td class="td-lyrics" rowspan="${row.lyricsSpan}" style="color:${escapeHtml(row.lyrics.color)}">${escapeHtml(row.lyrics.text)}</td>`;
                }

                return `
                  <tr>
                    ${row.structSpan !== 0 ? structTd : ''}
                    ${row.lyricsSpan !== 0 ? lyricsTd : ''}
                    <td class="td-grid">${row.bar1}</td>
                    <td class="td-grid">${row.bar2}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
