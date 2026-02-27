// ===== DOM References =====
const textInput = document.getElementById('textInput');
const colCountSelect = document.getElementById('colCount');
const guideRowsInput = document.getElementById('guideRows');
const blankRowsInput = document.getElementById('blankRows');
const fontGroup = document.getElementById('fontGroup');
// const optHeadProhibit = document.getElementById('optHeadProhibit');
// const optTailProhibit = document.getElementById('optTailProhibit');
// const optNewlineIndent = document.getElementById('optNewlineIndent');
const titleInput = document.getElementById('titleInput');
const printBtn = document.getElementById('printBtn');
const output = document.getElementById('output');

// ===== Constants =====
const HEAD_PROHIBIT_CHARS = new Set(['.', ',', '"', "'", '\u201D', '\u2019', '?', '!']);
const TAIL_PROHIBIT_CHARS = new Set(['"', "'", '\u201C', '\u2018']);

// 원고지 가로쓰기 문장부호 위치
const POS_BL_CHARS = new Set(['.', ',']);                   // 마침표·쉼표 → 좌하
const POS_TR_CHARS = new Set(['\u201C', '\u2018']);       // " ' 여는 따옴표 → 우상
const POS_TL_CHARS = new Set(['\u201D', '\u2019']);      // " ' 닫는 따옴표 → 좌상
const COMBINABLE_CLOSING = new Set(['"', "'", '\u201D', '\u2019']); // 마침표/쉼표 뒤에 올 수 있는 닫는 따옴표

function getCharPosition(ch) {
  if (POS_BL_CHARS.has(ch)) return 'pos-bl';
  if (POS_TR_CHARS.has(ch)) return 'pos-tr';
  if (POS_TL_CHARS.has(ch)) return 'pos-tl';
  return null;
}

/** 반각(half-width) 문자 판별. 대문자·!·?·스마트따옴표는 전각 처리 */
function isHalfWidth(ch) {
  if (ch >= 'A' && ch <= 'Z') return false;
  if (ch === '!' || ch === '?') return false;
  if ('\u201C\u201D\u2018\u2019'.includes(ch)) return false;
  const code = ch.charCodeAt(0);
  if (ch === ' ') return true;
  if (code >= 0x21 && code <= 0x7E) return true;
  return false;
}

// ===== Text Processing =====

/**
 * Tokenize: two-phase processing.
 * Phase 1: combine period/comma + closing quote (원고지 규칙, 최우선)
 * Phase 2: pair consecutive half-width single chars into one token
 */
function tokenize(text) {
  const chars = [...text];

  // Phase 1: 마침표/쉼표 + 닫는 따옴표 합침
  const phase1 = [];
  let i = 0;
  while (i < chars.length) {
    if (POS_BL_CHARS.has(chars[i]) && i + 1 < chars.length && COMBINABLE_CLOSING.has(chars[i + 1])) {
      phase1.push(chars[i] + chars[i + 1]);
      i += 2;
    } else {
      phase1.push(chars[i]);
      i++;
    }
  }

  // Phase 2: 연속 반각 단일 문자 2개씩 페어링
  const tokens = [];
  i = 0;
  while (i < phase1.length) {
    const cur = phase1[i];
    const next = phase1[i + 1];
    if (cur.length === 1 && isHalfWidth(cur) && next !== undefined && next.length === 1 && isHalfWidth(next)) {
      tokens.push(cur + next);
      i += 2;
    } else {
      tokens.push(cur);
      i++;
    }
  }

  return tokens;
}

/**
 * Split text into grid rows, applying manuscript rules.
 * Returns an array of arrays, each inner array = one row of tokens.
 */
function layoutText(text, cols /*, useHeadRule, useTailRule, useIndent */) {
  const paragraphs = text.split('\n');
  const rows = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const tokens = tokenize(paragraphs[pi]);

    let row = [];

    // if (pi > 0 && useIndent) {
    //   row.push('');
    // }

    let i = 0;
    while (i < tokens.length) {
      if (row.length >= cols) {
        rows.push(row);
        row = [];
      }

      row.push(tokens[i]);
      i++;

      // if (row.length === cols) {
      //   // Tail prohibit: single opening quote at end of row → move to next row
      //   const lastToken = row[cols - 1];
      //   if (useTailRule && [...lastToken].length === 1 && TAIL_PROHIBIT_CHARS.has(lastToken)) {
      //     const moved = row.pop();
      //     rows.push(row);
      //     row = [moved];
      //     continue;
      //   }
      //
      //   // Head prohibit: next token starts with head-prohibit char → combine with last cell
      //   if (useHeadRule && i < tokens.length) {
      //     const nextFirst = [...tokens[i]][0];
      //     if (HEAD_PROHIBIT_CHARS.has(nextFirst)) {
      //       row[cols - 1] = row[cols - 1] + tokens[i];
      //       i++;
      //     }
      //   }
      // }
    }

    while (row.length < cols) {
      row.push('');
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    rows.push(Array(cols).fill(''));
  }

  return rows;
}

// ===== Grid Rendering =====

function computeCellSize(cols) {
  // A4 printable width ≈ 180mm, convert to approximate px for screen
  // For print, we use mm; for screen, we calculate based on container
  const maxWidthMm = 180;
  const cellMm = Math.floor(maxWidthMm / cols);
  return cellMm;
}

function populateCell(cell, text, cellSizeMm) {
  if (!text) return;

  const chars = [...text];

  // Single character
  if (chars.length === 1) {
    const pos = getCharPosition(chars[0]);
    if (pos) {
      const span = document.createElement('span');
      span.className = pos;
      span.textContent = chars[0];
      cell.appendChild(span);
    } else {
      cell.textContent = chars[0];
    }
    return;
  }

  // Multi-character: separate positioned punctuation vs regular chars
  const positioned = [];
  const regular = [];
  for (const ch of chars) {
    if (getCharPosition(ch)) {
      positioned.push(ch);
    } else {
      regular.push(ch);
    }
  }

  // All positioned punctuation (e.g. ." or ,") — side by side like hw-pair
  if (regular.length === 0 && positioned.length > 0) {
    const wrapper = document.createElement('span');
    wrapper.className = 'hw-pair';
    for (const ch of positioned) {
      const s = document.createElement('span');
      s.textContent = ch;
      wrapper.appendChild(s);
    }
    cell.appendChild(wrapper);
    return;
  }

  // Half-width pair (e.g. ab, 12, A3) — side by side, font size unchanged
  if (chars.length === 2 && chars.every(ch => isHalfWidth(ch))) {
    const wrapper = document.createElement('span');
    wrapper.className = 'hw-pair';
    for (const ch of chars) {
      const s = document.createElement('span');
      s.textContent = ch;
      wrapper.appendChild(s);
    }
    cell.appendChild(wrapper);
    return;
  }

  // Fallback: 3+ chars from head-prohibit (e.g. 다.") — squeezed
  cell.textContent = text;
  cell.style.fontSize = (cellSizeMm * 0.4) + 'mm';
  cell.style.letterSpacing = '-0.05em';
}

function createGridRow(chars, cols, cellSizeMm, cellType, fontFamily) {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'grid-row';

  for (let c = 0; c < cols; c++) {
    const cell = document.createElement('div');
    cell.className = `grid-cell ${cellType}`;
    cell.style.width = cellSizeMm + 'mm';
    cell.style.height = cellSizeMm + 'mm';
    cell.style.fontSize = (cellSizeMm * 0.6) + 'mm';
    cell.style.fontFamily = fontFamily;

    if (chars && chars[c]) {
      populateCell(cell, chars[c], cellSizeMm);
    }

    rowDiv.appendChild(cell);
  }

  return rowDiv;
}

function createEmptyGridRow(cols, cellSizeMm, fontFamily) {
  return createGridRow(null, cols, cellSizeMm, 'cell-blank', fontFamily);
}

// ===== Sheet Generation =====

function generateSheets(textRows, cols, guideCount, blankCount, cellSizeMm, fontFamily, title) {
  // Calculate how many "row groups" fit per A4 page
  // A4 height ≈ 297mm, margins = 30mm, title ~10mm => usable ≈ 247mm
  const usableHeightMm = 247;
  const titleHeightMm = title ? 15 : 0;
  const nameLineHeightMm = 10;
  const availableHeightMm = usableHeightMm - titleHeightMm - nameLineHeightMm;
  const rowsPerPage = Math.floor(availableHeightMm / cellSizeMm);

  // Build all visual rows as an ordered list
  const allVisualRows = [];

  for (const textRow of textRows) {
    // Main row (black text)
    allVisualRows.push({ type: 'cell-main', chars: textRow });
    // Guide rows (light gray)
    for (let g = 0; g < guideCount; g++) {
      allVisualRows.push({ type: 'cell-guide', chars: textRow });
    }
    // Blank rows
    for (let b = 0; b < blankCount; b++) {
      allVisualRows.push({ type: 'cell-blank', chars: null });
    }
  }

  // Split into pages
  const pages = [];
  for (let i = 0; i < allVisualRows.length; i += rowsPerPage) {
    pages.push(allVisualRows.slice(i, i + rowsPerPage));
  }

  // If no content at all, generate one empty page
  if (pages.length === 0) {
    pages.push([]);
  }

  return pages;
}

function render() {
  const text = textInput.value;
  if (!text.trim()) {
    output.innerHTML = '<p style="text-align:center;color:#999;margin:2rem;">문장을 입력해 주세요.</p>';
    return;
  }

  const cols = parseInt(colCountSelect.value, 10);
  const guideCount = parseInt(guideRowsInput.value, 10) || 0;
  const blankCount = parseInt(blankRowsInput.value, 10) || 0;
  const activeBtn = fontGroup.querySelector('.font-btn.active');
  const fontFamily = activeBtn ? activeBtn.dataset.font : "'KyoboHandwriting2024wsa', serif";
  // const useHeadRule = optHeadProhibit.checked;
  // const useTailRule = optTailProhibit.checked;
  // const useIndent = optNewlineIndent.checked;
  const title = titleInput.value.trim();

  const cellSizeMm = computeCellSize(cols);
  const textRows = layoutText(text, cols);
  const pages = generateSheets(textRows, cols, guideCount, blankCount, cellSizeMm, fontFamily, title);

  output.innerHTML = '';

  const totalPages = pages.length;

  pages.forEach((pageRows, pageIndex) => {
    const sheet = document.createElement('div');
    sheet.className = 'sheet';

    // Title
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'sheet-title';
      titleEl.textContent = title;
      titleEl.style.fontFamily = fontFamily;
      sheet.appendChild(titleEl);
    }

    // Name line
    const nameLine = document.createElement('div');
    nameLine.className = 'name-line';
    nameLine.innerHTML = '이름: <span></span>';
    sheet.appendChild(nameLine);

    // Grid rows
    for (const row of pageRows) {
      const rowEl = createGridRow(row.chars, cols, cellSizeMm, row.type, fontFamily);
      sheet.appendChild(rowEl);
    }

    // If page has few rows, fill remaining space with blank rows
    const currentRows = pageRows.length;
    const usableHeightMm = 247 - (title ? 15 : 0) - 10;
    const rowsPerPage = Math.floor(usableHeightMm / cellSizeMm);
    const remainingRows = rowsPerPage - currentRows;
    for (let r = 0; r < remainingRows; r++) {
      sheet.appendChild(createEmptyGridRow(cols, cellSizeMm, fontFamily));
    }

    // Page number
    const pageNum = document.createElement('div');
    pageNum.className = 'page-number';
    pageNum.textContent = `${pageIndex + 1} / ${totalPages}`;
    sheet.appendChild(pageNum);

    output.appendChild(sheet);
  });
}

// ===== Event Listeners =====
let renderTimer = null;
function debouncedRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 150);
}

// All inputs trigger live re-render
[textInput, colCountSelect, guideRowsInput, blankRowsInput,
 titleInput
 // , optHeadProhibit, optTailProhibit, optNewlineIndent
].forEach(el => {
  el.addEventListener('input', debouncedRender);
  el.addEventListener('change', debouncedRender);
});

// Font button group
fontGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.font-btn');
  if (!btn) return;
  fontGroup.querySelector('.active').classList.remove('active');
  btn.classList.add('active');
  render();
});

printBtn.addEventListener('click', () => {
  if (!output.children.length) render();
  window.print();
});

// Initial render
render();
