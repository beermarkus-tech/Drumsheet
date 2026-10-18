// --- PDF EXPORT ---
// The sheet is laid out in a hidden, isolated iframe at A4 size (so the editor's
// CSS can't interfere), split into pages by measuring real row heights, then
// each page is rasterized (html2canvas) into a PDF (jsPDF) that is downloaded
// directly. Every page repeats the song title/band/BPM and the table header.
// Both libraries are vendored in js/vendor and only loaded on first use.

const PDF_SCALE = 3;               // raster resolution: 3 x 96dpi ≈ 288dpi
const PAGE_W = 794, PAGE_H = 1123; // A4 at 96dpi (210 x 297mm)
const PAGE_PAD = 38;               // 10mm margin

function loadScript(win, src) {
  return new Promise((resolve, reject) => {
    const s = win.document.createElement('script');
    s.src = new URL(src, location.href).href;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    win.document.head.appendChild(s);
  });
}

// Ghost (repeat) bars are greyscale on screen via a CSS filter, which html2canvas
// can't draw, so convert their cell colors to grey here.
function greyBarHTML(bar) {
  const clone = bar.cloneNode(true);
  if (clone.getAttribute('data-repeat') === 'true') {
    clone.querySelectorAll('.grid-cell').forEach(cell => {
      const m = cell.style.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const y = Math.round(0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]);
        cell.style.backgroundColor = `rgb(${y}, ${y}, ${y})`;
      }
    });
  }
  clone.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
  return clone.outerHTML;
}

function gatherSheet() {
  const meta = {
    title: document.getElementById('disp-title').value || 'Untitled',
    band: document.getElementById('disp-band').value || 'Unknown Band',
    bpm: document.getElementById('disp-bpm').value || '120'
  };

  const rows = [];
  document.querySelectorAll('.editor-row').forEach(row => {
    const structSelect = row.querySelector('.struct-select');
    const lyricsInput = row.querySelector('.lyrics-input');
    const structText = structSelect.options[structSelect.selectedIndex].text;
    rows.push({
      struct: { text: structText === '-' ? '' : structText, color: structSelect.style.color },
      lyrics: { text: lyricsInput.value, color: lyricsInput.style.color },
      bar1: greyBarHTML(row.querySelector('#bar-1')),
      bar2: greyBarHTML(row.querySelector('#bar-2'))
    });
  });

  // A new section starts where a (non-empty) structure differs from the row above
  rows.forEach((row, i) => {
    row.sectionStart = i > 0 && row.struct.text !== '' && row.struct.text !== rows[i - 1].struct.text;
  });
  return { meta, rows };
}

function sheetCSS() {
  // Use the editor's grid line colors so the sheet matches the screen
  const rootStyle = getComputedStyle(document.documentElement);
  const lineVar = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const LINE_STRONG = lineVar('--line-strong', '#000000');
  const LINE_DARK = lineVar('--line-dark', '#555555');
  const LINE_LIGHT = lineVar('--line-light', '#bbbbbb');

  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: white; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page { width: ${PAGE_W}px; height: ${PAGE_H}px; padding: ${PAGE_PAD}px; background: white; overflow: hidden; }

    /* --- HEADER INFO (repeated on every page) --- */
    .song-header { border-bottom: 2px solid #000; margin-bottom: 15px; padding-bottom: 5px; display: flex; align-items: flex-end; }
    .song-header-main { flex: 1; min-width: 0; }
    .song-title { font-size: 24px; font-weight: bold; margin: 0; text-transform: uppercase; }
    .song-meta { margin-top: 5px; font-size: 14px; font-weight: bold; color: #333; }
    .page-no { font-size: 11px; color: #666; white-space: nowrap; }

    /* --- TABLE LAYOUT --- */
    /* Lines mirror the editor: rows are separated by dark grey, the Structure
       and Lyrics columns by light grey, each bar is edged in black (3px, shared
       between bar 1 and 2), quarter-note lines are dark grey and e/&/a lines
       light grey. A new section (e.g. Chorus -> Solo) starts with a black line
       as thick as the bar edges. border-collapse merges touching borders into
       one line (the wider one wins), so nothing is drawn twice. Grid cells
       themselves have no borders; the 16th ruler is an overlay, like on screen. */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid ${LINE_DARK}; }

    col.c-struct { width: 10%; }
    col.c-lyrics { width: 40%; }
    col.c-bar    { width: 25%; }

    tr { height: 28px; }
    tr.head-row { height: 14px; }

    /* --- CELLS --- */
    th, td { padding: 0; vertical-align: middle; border: 1px solid ${LINE_DARK}; }
    th {
      background: #ddd; padding: 4px;
      font-size: 11px; text-transform: uppercase; font-weight: bold;
    }
    .th-struct, .td-struct, .th-lyrics, .td-lyrics { border-right: 1px solid #ccc; }
    .th-bar, .td-grid { border-left: 3px solid ${LINE_STRONG}; border-right: 3px solid ${LINE_STRONG}; }
    tr.section-start > td { border-top: 3px solid ${LINE_STRONG}; }

    .td-struct { text-align: center; font-weight: bold; font-size: 12px; padding: 2px; background:#fff; }
    .td-lyrics { padding: 0 5px; font-size: 12px; font-style: italic; white-space: nowrap; overflow: hidden; background:#fff; }
    .td-grid { background: #fff; }

    /* --- GRID INTERNALS --- */
    .bar-container { display: flex; position: relative; width: 100%; height: 28px; }
    .bar-container.header-container { height: 14px; background: #e0e0e0; }
    .bar-container.repeat-mode { opacity: 0.4; }

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
  `;
}

function headerBarHTML() {
  const counts = ['1', 'e', '&', 'a'];
  let cells = '';
  for (let i = 0; i < 16; i++) {
    const minor = i % 4 !== 0;
    cells += `<div class="grid-cell header-cell${minor ? ' minor' : ''}" style="--slots:1;">${minor ? counts[i % 4] : (i / 4 + 1)}</div>`;
  }
  return `<div class="bar-container header-container">${cells}${generateBarGridlines()}</div>`;
}

// One page: header + table with the given rows. Structure/Lyrics boxes are
// merged vertically within the page (a box running over a page break simply
// continues, with its label repeated, on the next page). merge=false is used
// while measuring.
function pageHTML(meta, rows, pageNo, pageCount, merge = true) {
  const spans = rows.map(() => ({ struct: 1, lyrics: 1 }));
  if (merge) {
    for (let i = rows.length - 1; i > 0; i--) {
      const r = rows[i], p = rows[i - 1];
      if (r.struct.text !== '' && r.struct.text === p.struct.text) { spans[i - 1].struct += spans[i].struct; spans[i].struct = 0; }
      if (r.lyrics.text !== '' && r.lyrics.text === p.lyrics.text) { spans[i - 1].lyrics += spans[i].lyrics; spans[i].lyrics = 0; }
    }
  }

  const body = rows.map((row, i) => {
    const structTd = spans[i].struct ? `<td class="td-struct" rowspan="${spans[i].struct}" style="color:${escapeHtml(row.struct.color)}">${escapeHtml(row.struct.text)}</td>` : '';
    const lyricsTd = spans[i].lyrics ? `<td class="td-lyrics" rowspan="${spans[i].lyrics}" style="color:${escapeHtml(row.lyrics.color)}">${escapeHtml(row.lyrics.text)}</td>` : '';
    return `<tr${row.sectionStart ? ' class="section-start"' : ''}>${structTd}${lyricsTd}<td class="td-grid">${row.bar1}</td><td class="td-grid">${row.bar2}</td></tr>`;
  }).join('');

  return `
    <div class="song-header">
      <div class="song-header-main">
        <div class="song-title">${escapeHtml(meta.title)}</div>
        <div class="song-meta">${escapeHtml(meta.band)} &nbsp;|&nbsp; BPM: ${escapeHtml(meta.bpm)}</div>
      </div>
      ${pageCount > 1 ? `<div class="page-no">Page ${pageNo} / ${pageCount}</div>` : ''}
    </div>
    <table>
      <colgroup><col class="c-struct"><col class="c-lyrics"><col class="c-bar"><col class="c-bar"></colgroup>
      <thead>
        <tr class="head-row">
          <th rowspan="2" class="th-struct">Structure</th>
          <th rowspan="2" class="th-lyrics">Lyrics</th>
          <th class="th-bar">Bar 1</th>
          <th class="th-bar">Bar 2</th>
        </tr>
        <tr class="head-row">
          <td class="td-grid">${headerBarHTML()}</td>
          <td class="td-grid">${headerBarHTML()}</td>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

// Greedy pagination: keep adding rows while the table still ends inside the
// page's bottom margin.
function paginate(doc, meta, rows) {
  const probe = doc.createElement('div');
  probe.className = 'page';
  doc.body.appendChild(probe);
  const fits = (pageRows) => {
    probe.innerHTML = pageHTML(meta, pageRows, 1, 2, false);
    const bottom = probe.querySelector('table').getBoundingClientRect().bottom - probe.getBoundingClientRect().top;
    return bottom <= PAGE_H - PAGE_PAD;
  };

  const pages = [];
  let current = [];
  rows.forEach(row => {
    if (current.length && !fits(current.concat([row]))) {
      pages.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  });
  if (current.length || pages.length === 0) pages.push(current);
  probe.remove();
  return pages;
}

function pdfFileName(meta) {
  const base = `${meta.band} - ${meta.title}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  return (base || 'Drumsheet') + '.pdf';
}

async function downloadPdf() {
  const btn = document.getElementById('printBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Creating PDF…';

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed; left:-${PAGE_W + 100}px; top:0; width:${PAGE_W}px; height:${PAGE_H}px; border:0;`;
  document.body.appendChild(frame);

  try {
    const { meta, rows } = gatherSheet();

    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${sheetCSS()}</style></head><body></body></html>`);
    doc.close();

    if (!window.jspdf) await loadScript(window, 'js/vendor/jspdf.umd.min.js');
    await loadScript(frame.contentWindow, 'js/vendor/html2canvas.min.js');

    const pages = paginate(doc, meta, rows);
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < pages.length; i++) {
      const page = doc.createElement('div');
      page.className = 'page';
      page.innerHTML = pageHTML(meta, pages[i], i + 1, pages.length);
      doc.body.appendChild(page);
      const canvas = await frame.contentWindow.html2canvas(page, {
        scale: PDF_SCALE, backgroundColor: '#ffffff', logging: false,
        width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      page.remove();
    }

    pdf.save(pdfFileName(meta));
  } catch (e) {
    console.error(e);
    alert('Could not create the PDF: ' + e.message);
  } finally {
    frame.remove();
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}
