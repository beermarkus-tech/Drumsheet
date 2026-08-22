function printSheet() {
  // 1. GATHER DATA
  const meta = {
    title: document.getElementById('disp-title').value || 'Untitled',
    band: document.getElementById('disp-band').value || 'Unknown Band',
    bpm: document.getElementById('disp-bpm').value || '120'
  };
  const is16thHidden = document.body.classList.contains('hide-16th');

  // 2. SCRAPE ROWS
  const rawRows = [];
  document.querySelectorAll('.editor-row').forEach(row => {
    const structSelect = row.querySelector('.struct-select');
    const lyricsInput = row.querySelector('.lyrics-input');

    // Clone bars
    const bar1 = row.querySelector('#bar-1').outerHTML;
    const bar2 = row.querySelector('#bar-2').outerHTML;

    rawRows.push({
      struct: {
          text: structSelect.options[structSelect.selectedIndex].text,
          color: structSelect.style.color
      },
      lyrics: {
          text: lyricsInput.value,
          color: lyricsInput.style.color
      },
      bar1: bar1,
      bar2: bar2
    });
  });

  // 3. GENERATE HEADER ROW (Matching Grid Logic exactly)
  function getHeaderBarHTML(barNum) {
      let cells = '';
      const labels = ['1','e','+','a','2','e','+','a','3','e','+','a','4','e','+','a'];

      for(let i=0; i<16; i++) {
         let borderClass = '';
         if ((i+1) % 4 === 0 && i < 15) borderClass = 'border-dark';

         let hideClass = '';
         if ((i+1) % 2 === 0) hideClass = 'even-cell';

         cells += `<div class="grid-cell header-cell ${borderClass} ${hideClass}">${labels[i]}</div>`;
      }
      return `<div class="bar-container header-container" data-subd="16">${cells}</div>`;
  }

  // 4. CALCULATE ROWSPANS (Merging)
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
  const printWindow = window.open('', '_blank');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${meta.title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        /* --- RESET --- */
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
        table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2px solid #000; }

        col.c-struct { width: 10%; }
        col.c-lyrics { width: 40%; }
        col.c-bar    { width: 25%; }

        tr { border-bottom: 1px solid #000; height: 28px; }

        /* --- CELLS --- */
        th {
          background: #ddd; border: 1px solid #000; padding: 4px;
          font-size: 11px; text-transform: uppercase; font-weight: bold;
        }

        td { border-right: 1px solid #000; vertical-align: middle; padding: 0; }

        .td-struct { text-align: center; font-weight: bold; font-size: 12px; padding: 2px; background:#fff; }
        .td-lyrics { padding: 0 5px; font-size: 12px; font-style: italic; white-space: nowrap; overflow: hidden; background:#fff; }
        .td-grid { border-right: 1px solid #000; background: #fff; }

        /* --- GRID INTERNALS (CRITICAL FIXES) --- */

        .bar-container {
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 28px; /* Match tr height */
        }

        .grid-cell {
          display: flex !important;
          flex: 1 1 0px !important;
          justify-content: center;
          align-items: center;
          border-right: 1px solid #000 !important;
          box-sizing: border-box !important;
        }
        .grid-cell:last-child { border-right: none !important; }

        /* Header Styling */
        .header-cell { background: #e0e0e0; font-size: 9px; color: #333; }

        /* --- HIDE 16TH LOGIC --- */
        body.hide-16th .grid-cell:nth-child(even),
        body.hide-16th .header-cell.even-cell {
            display: none !important;
        }

        /* --- PRINT MEDIA (Standard A4) --- */
        @media print {
          body { background: none; padding: 0; display: block; }
          .sheet { width: 100%; max-width: none; box-shadow: none; padding: 0; margin: 0; }
          tr { break-inside: avoid; }
        }
      </style>
    </head>
    <body class="${is16thHidden ? 'hide-16th' : ''}">
      <div class="sheet">
          <div class="song-header">
              <div class="song-title">${meta.title}</div>
              <div class="song-meta">BAND: ${meta.band} &nbsp;|&nbsp; BPM: ${meta.bpm}</div>
          </div>

          <table>
            <colgroup>
              <col class="c-struct">
              <col class="c-lyrics">
              <col class="c-bar">
              <col class="c-bar">
            </colgroup>
            <thead>
              <tr>
                <th>Structure</th>
                <th>Lyrics</th>
                <th>Bar 1</th>
                <th>Bar 2</th>
              </tr>
              <tr style="height: 20px;">
                  <th style="background:#fff; border:none; border-right:1px solid #000;"></th>
                  <th style="background:#fff; border:none; border-right:1px solid #000;"></th>
                  <td class="td-grid" style="border-bottom: 1px solid #000;">${getHeaderBarHTML(1)}</td>
                  <td class="td-grid" style="border-bottom: 1px solid #000;">${getHeaderBarHTML(2)}</td>
              </tr>
            </thead>
            <tbody>
              ${rawRows.map(row => {
                let structTd = '';
                if (row.structSpan > 0) {
                   structTd = `<td class="td-struct" rowspan="${row.structSpan}" style="color:${row.struct.color}">${row.struct.text === '-' ? '' : row.struct.text}</td>`;
                }

                let lyricsTd = '';
                if (row.lyricsSpan > 0) {
                   lyricsTd = `<td class="td-lyrics" rowspan="${row.lyricsSpan}" style="color:${row.lyrics.color}">${row.lyrics.text}</td>`;
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
