// --- PDF EXPORT (vector) ---
// The sheet is drawn straight into an A4 PDF with jsPDF's vector primitives
// (lines, filled rectangles, text), so it stays sharp at any zoom and the text
// is real text. Layout mirrors the editor: rows separated by dark grey, the
// Structure/Lyrics/Bars columns by light grey, each bar edged in black (3px),
// quarter-note lines dark grey, e/&/a lines light grey, and a 3px black line
// where a new section starts. Lines are drawn after all fills, thin before
// thick, so a thick line is never covered by a thin one.
// Every page repeats title/band/BPM and the table header; rows that don't fit
// move to the next page, and a "Bars" group is never split across pages.
// jsPDF is vendored in js/vendor and only loaded on first use.

const MM_PER_PX = 25.4 / 96;              // screen px -> mm (96dpi)
const PDF = {
  pageW: 210, pageH: 297, margin: 10,
  rowH: 28 * MM_PER_PX,                   // same 28px rows as the old print sheet
  head1H: 5.2, head2H: 3.7,               // "BAR 1" row, "1 e & a" row
  thin: 1 * MM_PER_PX, medium: 2 * MM_PER_PX, thick: 3 * MM_PER_PX
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

// The built-in PDF font (Helvetica) only encodes Latin-1. Text containing
// anything else (emoji, arrows, other scripts) is drawn as a small high-res
// image at the same spot instead, rendered by the browser with the device's own
// fonts and emoji.
const PDF_SAFE_TEXT = /^[\x20-\x7E\xA0-\xFF]*$/;
const PT_TO_MM = 25.4 / 72;
const TEXT_IMG_PX_PER_MM = 16;                 // ≈ 400dpi
const textCanvas = document.createElement('canvas');

function canvasFont(font, sizePt) {
  const px = sizePt * PT_TO_MM * TEXT_IMG_PX_PER_MM;
  return `${font.includes('italic') ? 'italic ' : ''}${font.includes('bold') ? 'bold ' : ''}${px}px Helvetica, Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
}

// Width in mm of a string at a font/size, whichever way it will be drawn
function measureText(pdf, str, font, sizePt) {
  if (PDF_SAFE_TEXT.test(str)) {
    pdf.setFont('helvetica', font); pdf.setFontSize(sizePt);
    return pdf.getTextWidth(str);
  }
  const ctx = textCanvas.getContext('2d');
  ctx.font = canvasFont(font, sizePt);
  return ctx.measureText(str).width / TEXT_IMG_PX_PER_MM;
}

function textImage(str, font, sizePt, rgb, alpha = 1) {
  const ctx = textCanvas.getContext('2d');
  ctx.font = canvasFont(font, sizePt);
  const px = sizePt * PT_TO_MM * TEXT_IMG_PX_PER_MM;
  textCanvas.width = Math.ceil(ctx.measureText(str).width) + 4;
  textCanvas.height = Math.ceil(px * 1.4);
  ctx.font = canvasFont(font, sizePt);           // resizing resets the context
  ctx.fillStyle = `rgb(${rgb.join(',')})`;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 2, textCanvas.height / 2);
  return { data: textCanvas.toDataURL('image/png'), w: textCanvas.width / TEXT_IMG_PX_PER_MM, h: textCanvas.height / TEXT_IMG_PX_PER_MM };
}

// Any CSS color (hex, rgb(), named) -> [r, g, b]
const colorCtx = document.createElement('canvas').getContext('2d');
function rgbOf(css, fallback = [0, 0, 0]) {
  if (!css) return fallback;
  colorCtx.fillStyle = '#010203';
  colorCtx.fillStyle = css;
  const v = colorCtx.fillStyle;
  if (v === '#010203' && css.replace(/\s/g, '') !== '#010203') return fallback;
  if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.substr(i, 2), 16));
  const m = v.match(/(\d+(\.\d+)?)/g);
  return m ? m.slice(0, 3).map(Number) : fallback;
}

// Ghost (repeat) bars are drawn at 40% strength, greyscale, like on screen
function ghost(rgb) {
  const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const v = Math.round(255 - 0.4 * (255 - y));
  return [v, v, v];
}

// --- GATHER (from the editor) ---
function barModel(bar) {
  const lane = (cells) => [...cells].map(cell => ({
    start: parseInt(cell.id.split('_c')[1]),                 // 1..16
    slots: 16 / (parseInt(bar.getAttribute('data-subd')) || 8),
    sym: cell.innerText.trim(),
    color: cell.style.backgroundColor
  }));
  const split = bar.getAttribute('data-split') === 'true';
  return {
    repeat: bar.getAttribute('data-repeat') === 'true',
    subd: parseInt(bar.getAttribute('data-subd')) || 8,
    split,
    lanes: split
      ? [lane(bar.querySelectorAll('.sub-line.upper .grid-cell')), lane(bar.querySelectorAll('.sub-line.lower .grid-cell'))]
      : [lane(bar.querySelectorAll(':scope > .grid-cell'))]
  };
}

function gatherSheet() {
  const meta = {
    title: document.getElementById('disp-title').value || 'Untitled',
    band: document.getElementById('disp-band').value || 'Unknown Band',
    bpm: document.getElementById('disp-bpm').value || '120'
  };

  const rows = [];
  document.querySelectorAll('#rows-container .editor-row').forEach(row => {
    const structSelect = row.querySelector('.struct-select');
    const lyricsInput = row.querySelector('.lyrics-input');
    rows.push({
      struct: { text: structSelect.value, color: structSelect.style.color },
      lyrics: { text: lyricsInput.value, color: lyricsInput.style.color },
      bars: row.querySelector('.bars-btn').dataset.bars,
      barsMultiplier: row.querySelector('.bars-btn').dataset.mult,
      bar1: barModel(row.querySelector('#bar-1')),
      bar2: barModel(row.querySelector('#bar-2'))
    });
  });

  const structs = rows.map(r => r.struct.text);
  const groups = computeBarGroups(rows.map(r => ({ bars: r.bars, struct: r.struct.text })));
  rows.forEach((row, i) => {
    row.sectionStart = isSectionStart(structs, i);
    row.groupSpan = groups[i].span;
    row.groupCovered = groups[i].covered;
  });
  return { meta, rows };
}

// --- PAGINATION ---
// Units are bar groups (kept together) or single rows.
function paginate(rows, rowsPerPage) {
  const units = [];
  for (let i = 0; i < rows.length;) {
    const n = Math.max(1, rows[i].groupSpan);
    units.push(rows.slice(i, i + n));
    i += n;
  }
  const pages = [];
  let current = [];
  units.forEach(unit => {
    if (current.length && current.length + unit.length > rowsPerPage) { pages.push(current); current = []; }
    current = current.concat(unit);
  });
  if (current.length || pages.length === 0) pages.push(current);
  return pages;
}

// Vertical merges within one page: Structure and Lyrics boxes merge equal
// consecutive (non-empty) texts but never across a section start; Bars boxes
// follow the groups.
function pageSpans(rows) {
  const spans = rows.map(r => ({ struct: 1, lyrics: 1, bars: r.groupCovered ? 0 : Math.max(1, r.groupSpan) }));
  for (let i = rows.length - 1; i > 0; i--) {
    const r = rows[i], p = rows[i - 1];
    if (r.sectionStart) continue;
    if (r.struct.text !== '' && r.struct.text === p.struct.text) { spans[i - 1].struct += spans[i].struct; spans[i].struct = 0; }
    if (r.lyrics.text !== '' && r.lyrics.text === p.lyrics.text) { spans[i - 1].lyrics += spans[i].lyrics; spans[i].lyrics = 0; }
  }
  return spans;
}

// --- DRAWING ---
function drawSheetPage(pdf, meta, rows, pageNo, pageCount, L) {
  const { margin } = PDF;
  const lines = { light: [], dark: [], strong: [] };   // drawn after fills, thin -> thick
  const texts = [];                                    // drawn on top of everything
  const addLine = (kind, x1, y1, x2, y2, rgb, w) => lines[kind].push({ x1, y1, x2, y2, rgb, w });

  const fillRect = (x, y, w, h, rgb) => { pdf.setFillColor(...rgb); pdf.rect(x, y, w, h, 'F'); };
  const text = (str, x, y, opts, font, size, rgb, alpha = 1) => {
    const lines = Array.isArray(str) ? str : [str];
    if (lines.every(l => PDF_SAFE_TEXT.test(l))) {
      texts.push(() => {
        pdf.setFont('helvetica', font); pdf.setFontSize(size); pdf.setTextColor(...rgb);
        pdf.text(str, x, y, { baseline: 'middle', ...opts });
      });
      return;
    }
    lines.forEach((line, k) => {
      if (!line) return;
      const img = textImage(line, font, size, rgb, alpha);
      const lx = opts.align === 'center' ? x - img.w / 2 : opts.align === 'right' ? x - img.w : x;
      const ly = y + k * size * PT_TO_MM * 1.15 - img.h / 2;    // jsPDF's default line height
      texts.push(() => pdf.addImage(img.data, 'PNG', lx, ly, img.w, img.h));
    });
  };
  const fitText = (str, maxW, font, size) => {    // clip like the editor (no wrapping)
    const chars = [...str];                        // don't cut emoji in half
    while (chars.length && measureText(pdf, chars.join(''), font, size) > maxW) chars.pop();
    return chars.join('');
  };

  // --- Song header ---
  let y = margin;
  text(meta.title.toUpperCase(), margin, y + 3.6, {}, 'bold', 18, [0, 0, 0]);
  text(`${meta.band}  |  BPM: ${meta.bpm}`, margin, y + 9.5, {}, 'bold', 10.5, [51, 51, 51]);
  if (pageCount > 1) text(`Page ${pageNo} / ${pageCount}`, PDF.pageW - margin, y + 9.5, { align: 'right' }, 'normal', 8, [102, 102, 102]);
  y += 12.6;
  pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(PDF.medium);
  pdf.line(margin, y, PDF.pageW - margin, y);
  y += 4;

  // --- Table header ---
  const top = y;
  const headH = PDF.head1H + PDF.head2H;
  fillRect(L.xStruct, top, L.xBar1 - L.xStruct, headH, [221, 221, 221]);
  [L.xBar1, L.xBar2].forEach(x => {
    fillRect(x, top, L.barW, PDF.head1H, [221, 221, 221]);
    fillRect(x, top + PDF.head1H, L.barW, PDF.head2H, [224, 224, 224]);
  });
  const headLabel = (str, x, w) => text(str, x + w / 2, top + headH / 2, { align: 'center' }, 'bold', 7.5, [0, 0, 0]);
  headLabel('STRUCTURE', L.xStruct, L.structW);
  headLabel('LYRICS', L.xLyrics, L.lyricsW);
  headLabel('BARS', L.xBars, L.barsW);
  ['BAR 1', 'BAR 2'].forEach((label, b) => {
    const x = b ? L.xBar2 : L.xBar1;
    text(label, x + L.barW / 2, top + PDF.head1H / 2, { align: 'center' }, 'bold', 7.5, [0, 0, 0]);
    const counts = ['1', 'e', '&', 'a'];
    for (let i = 0; i < 16; i++) {
      const minor = i % 4 !== 0;
      text(minor ? counts[i % 4] : String(i / 4 + 1), x + (i + 0.5) * L.barW / 16, top + PDF.head1H + PDF.head2H / 2,
        { align: 'center' }, minor ? 'normal' : 'bold', 6, [51, 51, 51]);
    }
    addRuler(x, top + PDF.head1H, PDF.head2H, false);
  });
  addLine('dark', L.xBar1, top + PDF.head1H, L.xEnd, top + PDF.head1H, L.dark, PDF.thin);   // under "BAR 1/2"
  addLine('dark', L.xStruct, top, L.xEnd, top, L.dark, PDF.thin);                           // table top
  addLine('dark', L.xStruct, top + headH, L.xEnd, top + headH, L.dark, PDF.thin);           // header bottom
  addLine('light', L.xLyrics, top, L.xLyrics, top + headH, L.colLine, PDF.thin);
  addLine('light', L.xBars, top, L.xBars, top + headH, L.colLine, PDF.thin);

  // 16th ruler for one bar: light e/&/a ticks, dark quarter ticks. Like on
  // screen, only ticks on the bar's own cell boundaries are drawn (1/8: no e/a,
  // 1/4: quarters only, 1/2: beat 3 only, Full: none).
  function addRuler(x, yTop, h, isGhost, subd = 16) {
    const step = 16 / subd;
    for (let k = 1; k <= 15; k++) {
      if (k % step !== 0) continue;
      const strong = k % 4 === 0;
      const tx = x + k * L.barW / 16;
      if (strong) addLine('dark', tx, yTop, tx, yTop + h, isGhost ? ghost(L.dark) : L.dark, PDF.medium);
      else addLine('light', tx, yTop, tx, yTop + h, isGhost ? ghost(L.light) : L.light, PDF.thin);
    }
  }

  // --- Rows ---
  const spans = pageSpans(rows);
  const bodyTop = top + headH;
  const rowY = i => bodyTop + i * PDF.rowH;

  rows.forEach((row, i) => {
    const y0 = rowY(i);
    const sp = spans[i];

    if (sp.struct) {
      const h = sp.struct * PDF.rowH;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
      const maxLines = Math.max(1, Math.floor(h / 3.6));
      const wrapped = PDF_SAFE_TEXT.test(row.struct.text)
        ? pdf.splitTextToSize(row.struct.text, L.structW - 1.5).slice(0, maxLines)
        : [fitText(row.struct.text, L.structW - 1.5, 'bold', 8.5)];
      text(wrapped, L.xStruct + L.structW / 2, y0 + h / 2 - (wrapped.length - 1) * 1.8, { align: 'center' }, 'bold', 8.5, rgbOf(row.struct.color));
      addLine('dark', L.xStruct, y0 + h, L.xLyrics, y0 + h, L.dark, PDF.thin);
    }
    if (sp.lyrics) {
      const h = sp.lyrics * PDF.rowH;
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8.5);
      text(fitText(row.lyrics.text, L.lyricsW - 2.6, 'italic', 8.5), L.xLyrics + 1.3, y0 + h / 2, {}, 'italic', 8.5, rgbOf(row.lyrics.color));
      addLine('dark', L.xLyrics, y0 + h, L.xBars, y0 + h, L.dark, PDF.thin);
    }
    if (sp.bars) {
      const h = sp.bars * PDF.rowH;
      const value = row.groupSpan ? barsLabel(row.bars, row.barsMultiplier) : '';
      if (value) text(value, L.xBars + L.barsW / 2, y0 + h / 2, { align: 'center' }, 'bold', 9, [0, 0, 0]);
      addLine('dark', L.xBars, y0 + h, L.xBar1, y0 + h, L.dark, PDF.thin);
    }

    [row.bar1, row.bar2].forEach((bar, b) => drawBar(bar, b ? L.xBar2 : L.xBar1, y0));
    addLine('dark', L.xBar1, y0 + PDF.rowH, L.xEnd, y0 + PDF.rowH, L.dark, PDF.thin);

    if (row.sectionStart && i > 0) addLine('strong', L.xStruct, y0, L.xEnd, y0, L.strong, PDF.thick);
  });

  function drawBar(bar, x, y0) {
    const laneH = PDF.rowH / bar.lanes.length;
    const cellW = L.barW / 16;
    bar.lanes.forEach((cells, laneIdx) => {
      const ly = y0 + laneIdx * laneH;
      cells.forEach(cell => {
        const cx = x + (cell.start - 1) * cellW, cw = cell.slots * cellW;
        if (cell.color) {
          const rgb = rgbOf(cell.color, null);
          if (rgb) fillRect(cx, ly, cw, laneH, bar.repeat ? ghost(rgb) : rgb);
        }
        if (cell.sym) {
          let size = bar.split ? 7 : 8.5;
          while (size > 4 && measureText(pdf, cell.sym, 'bold', size) > cw - 0.6) size -= 0.5;
          text(cell.sym, cx + cw / 2, ly + laneH / 2, { align: 'center' }, 'bold', size, bar.repeat ? [153, 153, 153] : [0, 0, 0], bar.repeat ? 0.4 : 1);
        }
      });
    });
    if (bar.split) addLine('light', x, y0 + laneH, x + L.barW, y0 + laneH, bar.repeat ? ghost(L.light) : L.light, PDF.thin);
    addRuler(x, y0, PDF.rowH, bar.repeat, bar.subd);
  }

  // --- Column lines + frame ---
  const bottom = rowY(rows.length);
  addLine('light', L.xLyrics, bodyTop, L.xLyrics, bottom, L.colLine, PDF.thin);
  addLine('light', L.xBars, bodyTop, L.xBars, bottom, L.colLine, PDF.thin);
  addLine('dark', L.xStruct, top, L.xStruct, bottom, L.dark, PDF.thin);
  addLine('dark', L.xStruct, bottom, L.xBar1, bottom, L.dark, PDF.thin);
  [L.xBar1, L.xBar2, L.xEnd].forEach(x => addLine('strong', x, top, x, bottom, L.strong, PDF.thick));

  // --- Stroke: thin first, thick last; then all text on top ---
  pdf.setLineCap('butt');
  ['light', 'dark', 'strong'].forEach(kind => lines[kind].forEach(l => {
    pdf.setDrawColor(...l.rgb); pdf.setLineWidth(l.w);
    pdf.line(l.x1, l.y1, l.x2, l.y2);
  }));
  texts.forEach(draw => draw());
}

function pdfLayout(pdf, rows = []) {
  const rootStyle = getComputedStyle(document.documentElement);
  const lineVar = (name, fallback) => rgbOf(rootStyle.getPropertyValue(name).trim(), fallback);

  const { margin, pageW } = PDF;
  const tableW = pageW - 2 * margin;
  const structW = tableW * 0.10;
  const barW = tableW * 0.25;
  // "Bars" is only as wide as its header label needs
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
  // and its widest value (e.g. "6x8")
  let barsW = pdf.getTextWidth('BARS');
  pdf.setFontSize(9);
  rows.forEach(r => { if (r.groupSpan) barsW = Math.max(barsW, pdf.getTextWidth(barsLabel(r.bars, r.barsMultiplier))); });
  barsW += 2.4;
  const lyricsW = tableW - structW - barsW - 2 * barW;

  const xStruct = margin;
  const xLyrics = xStruct + structW;
  const xBars = xLyrics + lyricsW;
  const xBar1 = xBars + barsW;
  const xBar2 = xBar1 + barW;
  return {
    structW, lyricsW, barsW, barW, xStruct, xLyrics, xBars, xBar1, xBar2, xEnd: xBar2 + barW,
    strong: lineVar('--line-strong', [0, 0, 0]),
    dark: lineVar('--line-dark', [85, 85, 85]),
    light: lineVar('--line-light', [187, 187, 187]),
    colLine: [204, 204, 204]
  };
}

function pdfFileName(meta) {
  const base = `${meta.band} - ${meta.title}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  return (base || 'Drumsheet') + '.pdf';
}

async function buildPdf() {
  if (!window.jspdf) await loadScript('js/vendor/jspdf.umd.min.js');
  const { meta, rows } = gatherSheet();
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pdf.setProperties({ title: `${meta.title} – ${meta.band}`, creator: 'Drumsheet' });
  const L = pdfLayout(pdf, rows);

  const tableTop = PDF.margin + 12.6 + 4 + PDF.head1H + PDF.head2H;
  const rowsPerPage = Math.floor((PDF.pageH - PDF.margin - tableTop) / PDF.rowH);
  const pages = paginate(rows, rowsPerPage);
  pages.forEach((pageRows, i) => {
    if (i > 0) pdf.addPage();
    drawSheetPage(pdf, meta, pageRows, i + 1, pages.length, L);
  });
  return { pdf, meta };
}

async function downloadPdf() {
  const btn = document.getElementById('printBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Creating PDF…';
  try {
    const { pdf, meta } = await buildPdf();
    pdf.save(pdfFileName(meta));
  } catch (e) {
    console.error(e);
    alert('Could not create the PDF: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// --- PREVIEW ---
// Builds exactly the same PDF as the download and renders that file's pages
// with pdf.js (vendored), so the preview is the PDF itself. (Android browsers
// can't show a PDF inline, hence no <iframe>.)
let previewedPdf = null;

async function previewPdf() {
  const btn = document.getElementById('previewBtn');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Preparing…';
  const pages = document.getElementById('preview-pages');
  try {
    const { pdf, meta } = await buildPdf();
    previewedPdf = { pdf, meta };
    document.getElementById('preview-title').textContent = pdfFileName(meta);
    pages.innerHTML = '<div class="preview-status">Rendering…</div>';
    document.getElementById('pdfPreviewModal').style.display = 'flex';

    if (!window.pdfjsLib) {
      await loadScript('js/vendor/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    }
    const doc = await window.pdfjsLib.getDocument({ data: pdf.output('arraybuffer') }).promise;
    pages.innerHTML = '';
    const cssWidth = Math.min(pages.clientWidth - 32, 900);
    const dpr = window.devicePixelRatio || 1;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const scale = cssWidth / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = cssWidth + 'px';
      pages.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (e) {
    console.error(e);
    pages.innerHTML = '';
    closePdfPreview();
    alert('Could not create the preview: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function downloadPreviewedPdf() {
  if (previewedPdf) previewedPdf.pdf.save(pdfFileName(previewedPdf.meta));
}

function closePdfPreview() {
  document.getElementById('pdfPreviewModal').style.display = 'none';
  document.getElementById('preview-pages').innerHTML = '';
  previewedPdf = null;
}
