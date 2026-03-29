// ===== DOM References =====
const textInput = document.getElementById('textInput');
const colCountSelect = document.getElementById('colCount');
const guideRowsInput = document.getElementById('guideRows');
const blankRowsInput = document.getElementById('blankRows');
const textColorInput = document.getElementById('textColor');
const optParagraphIndent = document.getElementById('optParagraphIndent');
const optDialogueBreak = document.getElementById('optDialogueBreak');
const fontGroup = document.getElementById('fontGroup');
const titleInput = document.getElementById('titleInput');
const printBtn = document.getElementById('printBtn');
const output = document.getElementById('output');
const printModal = document.getElementById('printModal');
const closeModalBtn = document.getElementById('closeModalBtn');

// ===== Constants =====
// 원고지 가로쓰기 문장부호 위치
const POS_BL_CHARS = new Set(['.', ',']);                   // 마침표·쉼표 → 좌하
const POS_TR_CHARS = new Set(['\u201C', '\u2018']);         // " ' 여는 따옴표 → 우상
const POS_TL_CHARS = new Set(['\u201D', '\u2019']);         // " ' 닫는 따옴표 → 좌상
const COMBINABLE_CLOSING = new Set(['"', "'", '\u201D', '\u2019']); // 마침표/쉼표 뒤에 올 수 있는 닫는 따옴표

function getCharPosition(ch) {
  if (POS_BL_CHARS.has(ch)) return 'pos-bl';
  if (POS_TR_CHARS.has(ch)) return 'pos-tr';
  if (POS_TL_CHARS.has(ch)) return 'pos-tl';
  return null;
}

/** 반각(half-width) 문자 판별 */
function isHalfWidth(ch) {
  // 아라비아 숫자, 알파벳 소문자는 한 칸에 두 자씩
  if (ch >= '0' && ch <= '9') return true;
  if (ch >= 'a' && ch <= 'z') return true;
  return false;
}

// ===== Text Processing =====

function convertSmartQuotes(text) {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      result += inDoubleQuote ? '\u201D' : '\u201C';
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'") {
      result += inSingleQuote ? '\u2019' : '\u2018';
      inSingleQuote = !inSingleQuote;
    } else {
      result += char;
    }
  }
  return result;
}

function cleanText(text) {
  text = convertSmartQuotes(text);
  // 말줄임표 규칙: 3~6개의 점이나 1~2개의 줄임표를 2칸 차지하는 '……'로 변환
  text = text.replace(/\.{3,6}|…{1,2}/g, '……');
  // 온점/반점 규칙: 뒤에 오는 띄어쓰기(공백/탭) 제거
  text = text.replace(/([.,]["']?)[ \t]+/g, '$1');
  // 느낌표/물음표 규칙: 뒤에 띄어쓰기 강제 추가 (닫는 따옴표나 이미 공백이 있지 않은 경우)
  text = text.replace(/([!?]["']?)(?=[^\s"'])/g, '$1 ');
  return text;
}

function tokenize(text) {
  const chars = [...text];
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
 */
function layoutText(text, cols, useParagraphIndent, useDialogueBreak) {
  text = cleanText(text);
  text = text.replace(/\n+$/, ''); // 끝에 남은 불필요한 엔터 제거하여 빈 페이지 방지
  const paragraphs = text.split('\n');
  const rows = [];
  let inDialogue = false;
  let postDialogueBreakPending = false; // 대화문이 끝난 뒤 다음 줄바꿈 예약

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const pText = paragraphs[pi];

    // 빈 문단 건너뛰기 처리
    if (pText.trim() === '') {
      if (pi === paragraphs.length - 1) continue; // 마지막 줄이 빈 줄이면 무시
      const emptyRow = [];
      while (emptyRow.length < cols) emptyRow.push({ text: '', vMark: false });
      rows.push(emptyRow);
      continue;
    }

    const tokens = tokenize(pText);
    let row = [];

    // 기본 문단 시작 들여쓰기 적용
    if (useParagraphIndent) {
      while (tokens.length > 0 && tokens[0] === ' ') tokens.shift(); // 수동 공백 제거
      row.push({ text: '', vMark: false });
    }

    let i = 0;
    while (i < tokens.length) {
      const char = tokens[i];

      // 1. 줄이 다 찼을 때 줄바꿈 및 행말 금칙 적용 (순서 최상단으로 이동)
      if (row.length >= cols) {
        const isProhibitedStart = /^[.,?!'"\u201D\u2019]/.test(char);

        if (isProhibitedStart) {
          // 행말 금칙: 줄 끝에 문자 추가 후 밀어내기
          row[cols - 1].text += char;
          rows.push(row);
          row = [];
          if (useParagraphIndent && inDialogue) row.push({ text: '', vMark: false });
          i++;
          continue;
        } else {
          // 정상적인 줄바꿈
          rows.push(row);
          row = [];
          if (useParagraphIndent && inDialogue) row.push({ text: '', vMark: false });
        }
      }

      // 2. 공백(띄어쓰기) 처리 규칙
      if (char === ' ') {
        // 현재 줄이 비어있거나 첫 칸 들여쓰기만 된 상태라면 띄어쓰기 생략 후 이전 줄에 V 마크
        if (row.every(c => c.text === '')) {
          if (rows.length > 0) rows[rows.length - 1][cols - 1].vMark = true;
          i++;
          continue;
        } else if (postDialogueBreakPending && useDialogueBreak) {
          i++;
          continue; // 대화문 끝나고 줄바꿈 예약 상태일 때 띄어쓰기는 생략
        }
      }

      const isStartingQuote = char.includes('\u201C') || char.includes('\u2018');
      const isEndingQuote = char.includes('\u201D') || char.includes('\u2019');
      const isPunctuation = /^[.,?!]/.test(char);

      // 3. 대화문 종료 후 새로운 단어 등장 시 강제 줄바꿈 (대화문 줄바꿈 규칙)
      if (useDialogueBreak && postDialogueBreakPending) {
        if (!isEndingQuote && !isPunctuation) {
          if (row.some(c => c.text !== '')) {
            while (row.length < cols) row.push({ text: '', vMark: false });
            rows.push(row);
            row = [];
          }
          if (useParagraphIndent && row.length === 0) row.push({ text: '', vMark: false }); // 새 줄 들여쓰기
          postDialogueBreakPending = false;
        }
      }

      // 4. 새로운 대화문 시작 시 강제 줄바꿈
      if (useDialogueBreak && isStartingQuote) {
        if (row.some(c => c.text !== '')) {
          while (row.length < cols) row.push({ text: '', vMark: false });
          rows.push(row);
          row = [];
        }
        if (useParagraphIndent && row.length === 0) row.push({ text: '', vMark: false });
        inDialogue = true;
        postDialogueBreakPending = false;
      }

      // 5. 대화문 종료 감지
      if (isEndingQuote) {
        inDialogue = false;
        if (useDialogueBreak) postDialogueBreakPending = true;
      }

      row.push({ text: char, vMark: false });
      i++;
    }

    while (row.length < cols) {
      row.push({ text: '', vMark: false });
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    const emptyRow = [];
    while (emptyRow.length < cols) emptyRow.push({ text: '', vMark: false });
    rows.push(emptyRow);
  }

  return rows;
}

// ===== Grid Rendering =====

// 폰트별 특성(크기, 굵기, 수직 정렬)을 세밀하게 보정하는 함수
function getFontConfig(fontFamily) {
  const config = { scale: 1, paddingTop: '0', fontWeight: '400' };
  if (fontFamily.includes('궁서') || fontFamily.includes('Gungsuh')) {
    config.paddingTop = '2.5%';
    config.fontWeight = '700';
  } else if (fontFamily.includes('Nanum Myeongjo')) {
    config.paddingTop = '2%';
  } else if (fontFamily.includes('Nanum Pen Script')) {
    config.scale = 1.35;
    config.paddingTop = '1%';
  }
  return config;
}

function computeCellSize(cols) {
  const maxWidthMm = 180;
  return Math.floor(maxWidthMm / cols);
}

function populateCell(cell, tokenObj, cellSizeMm, fontConfig) {
  if (!tokenObj) return;

  const text = tokenObj.text;
  const vMark = tokenObj.vMark;

  if (text) {
    const chars = [...text];
    if (chars.length === 1) {
      if (text === '…') {
        const span = document.createElement('span');
        span.className = 'pos-center';
        span.textContent = chars[0];
        cell.appendChild(span);
      } else {
        const pos = getCharPosition(chars[0]);
        if (pos) {
          const span = document.createElement('span');
          span.className = pos;
          span.textContent = chars[0];
          cell.appendChild(span);
        } else {
          cell.textContent = chars[0];
        }
      }
    } else {
      const positioned = [];
      const regular = [];
      for (const ch of chars) {
        if (getCharPosition(ch)) positioned.push(ch);
        else regular.push(ch);
      }

      if (regular.length === 0 && positioned.length > 0) {
        // 문장부호들만 있는 경우 (예: .")
        for (const ch of positioned) {
          let pos = getCharPosition(ch);
          // 닫는 따옴표가 쉼표/마침표와 함께 올 경우 오른쪽 상단으로 정렬 변경
          if ((ch === '\u201D' || ch === '\u2019') && positioned.some(p => p === '.' || p === ',')) {
            pos = 'pos-tr';
          }
          const span = document.createElement('span');
          span.className = pos;
          span.textContent = ch;
          cell.appendChild(span);
        }
      } else if (regular.length === 1 && positioned.length >= 1) {
        // 행말 금칙으로 인해 일반 글자와 부호가 한 칸에 병합된 경우 (예: 다.)
        const spanText = document.createElement('span');
        spanText.textContent = regular[0];
        cell.appendChild(spanText);

        for (const ch of positioned) {
          let pos = getCharPosition(ch);
          // 마침표나 쉼표가 글자와 한 칸에 있을 때는 칸 밖으로 나가지 않도록 우측 하단으로 이동
          if (pos === 'pos-bl') {
            pos = 'pos-br';
          } else if (pos === 'pos-tl') {
            pos = 'pos-tr';
          }
          const spanPos = document.createElement('span');
          spanPos.className = pos;
          spanPos.textContent = ch;
          cell.appendChild(spanPos);
        }
      } else if (chars.length === 2 && chars.every(ch => isHalfWidth(ch))) {
        const wrapper = document.createElement('span');
        wrapper.className = 'hw-pair';
        for (const ch of chars) {
          const s = document.createElement('span');
          s.textContent = ch;
          wrapper.appendChild(s);
        }
        cell.appendChild(wrapper);
      } else {
        cell.textContent = text;
        cell.style.fontSize = (cellSizeMm * 0.4 * fontConfig.scale) + 'mm';
        cell.style.letterSpacing = '-0.05em';
      }
    }
  }

  if (vMark) {
    const vSpan = document.createElement('span');
    vSpan.className = 'v-mark';
    vSpan.textContent = '∨';
    cell.appendChild(vSpan);
  }
}

function createGridRow(tokens, cols, cellSizeMm, cellType, fontFamily, textColor) {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'grid-row';
  const fontConfig = getFontConfig(fontFamily);

  for (let c = 0; c < cols; c++) {
    const cell = document.createElement('div');
    cell.className = `grid-cell ${cellType}`;
    cell.style.width = cellSizeMm + 'mm';
    cell.style.height = cellSizeMm + 'mm';
    cell.style.fontSize = (cellSizeMm * 0.6 * fontConfig.scale) + 'mm';
    cell.style.fontFamily = fontFamily;
    cell.style.fontWeight = fontConfig.fontWeight;
    cell.style.paddingTop = fontConfig.paddingTop;

    if (cellType === 'cell-main' && textColor) {
      cell.style.color = textColor;
    }

    if (tokens && tokens[c]) {
      let renderToken = tokens[c];
      if (cellType !== 'cell-main' && renderToken.vMark) {
        renderToken = { text: renderToken.text, vMark: false };
      }
      populateCell(cell, renderToken, cellSizeMm, fontConfig);
    }
    rowDiv.appendChild(cell);
  }
  return rowDiv;
}

function createEmptyGridRow(cols, cellSizeMm, fontFamily) {
  const emptyTokens = Array(cols).fill({ text: '', vMark: false });
  return createGridRow(emptyTokens, cols, cellSizeMm, 'cell-blank', fontFamily, null);
}

// ===== Sheet Generation =====

function generateSheets(textRows, cols, guideCount, blankCount, cellSizeMm, fontFamily, title) {
  // 빈 페이지 추가 인쇄 버그 방지를 위해 사용 가능 높이를 여유 있게 축소
  const titleHeightMm = title ? 15 : 0;
  const nameLineHeightMm = 10;
  const pageNumHeightMm = 10;
  const innerA4Height = 267; // A4 297mm - 상하 패딩 30mm
  const availableHeightMm = innerA4Height - titleHeightMm - nameLineHeightMm - pageNumHeightMm - 5; // 5mm 여유 마진
  const rowsPerPage = Math.floor(availableHeightMm / cellSizeMm);

  const allVisualRows = [];
  for (const textRow of textRows) {
    allVisualRows.push({ type: 'cell-main', chars: textRow });
    for (let g = 0; g < guideCount; g++) {
      allVisualRows.push({ type: 'cell-guide', chars: textRow });
    }
    for (let b = 0; b < blankCount; b++) {
      allVisualRows.push({ type: 'cell-blank', chars: null });
    }
  }

  const pages = [];
  for (let i = 0; i < allVisualRows.length; i += rowsPerPage) {
    pages.push(allVisualRows.slice(i, i + rowsPerPage));
  }

  if (pages.length === 0) {
    pages.push([]);
  }

  return pages;
}

function render() {
  let text = textInput.value;
  text = text.replace(/\n+$/, ''); // 끝에 붙은 빈 엔터 지우기

  if (!text.trim()) {
    output.innerHTML = '<p style="text-align:center;color:#999;margin:2rem;">문장을 입력해 주세요.</p>';
    return;
  }

  const cols = parseInt(colCountSelect.value, 10);
  const guideCount = parseInt(guideRowsInput.value, 10) || 0;
  const blankCount = parseInt(blankRowsInput.value, 10) || 0;
  const activeBtn = fontGroup.querySelector('.font-btn.active');
  const fontFamily = activeBtn ? activeBtn.dataset.font : "'Noto Serif KR', serif";
  const title = titleInput.value.trim();
  const textColor = textColorInput.value;
  const useParagraphIndent = optParagraphIndent.checked;
  const useDialogueBreak = optDialogueBreak.checked;

  const cellSizeMm = computeCellSize(cols);
  const textRows = layoutText(text, cols, useParagraphIndent, useDialogueBreak);
  const pages = generateSheets(textRows, cols, guideCount, blankCount, cellSizeMm, fontFamily, title);

  output.innerHTML = '';
  const totalPages = pages.length;

  // 동적 여백 계산 (generateSheets 와 동일하게 적용)
  const titleHeightMm = title ? 15 : 0;
  const nameLineHeightMm = 10;
  const pageNumHeightMm = 10;
  const innerA4Height = 267;
  const availableHeightMm = innerA4Height - titleHeightMm - nameLineHeightMm - pageNumHeightMm - 5;
  const rowsPerPage = Math.floor(availableHeightMm / cellSizeMm);

  pages.forEach((pageRows, pageIndex) => {
    const sheet = document.createElement('div');
    sheet.className = 'sheet';

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'sheet-title';

      // 총 페이지가 1장이 넘을 경우에만 제목 뒤에 (1), (2) 번호 추가
      if (totalPages > 1) {
        titleEl.textContent = `${title} (${pageIndex + 1})`;
      } else {
        titleEl.textContent = title;
      }

      titleEl.style.fontFamily = fontFamily;
      sheet.appendChild(titleEl);
    }

    const nameLine = document.createElement('div');
    nameLine.className = 'name-line';
    nameLine.innerHTML = '이름: <span></span>';
    sheet.appendChild(nameLine);

    for (const row of pageRows) {
      const rowEl = createGridRow(row.chars, cols, cellSizeMm, row.type, fontFamily, textColor);
      sheet.appendChild(rowEl);
    }

    const currentRows = pageRows.length;
    const remainingRows = rowsPerPage - currentRows;
    for (let r = 0; r < remainingRows; r++) {
      sheet.appendChild(createEmptyGridRow(cols, cellSizeMm, fontFamily));
    }

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

[textInput, colCountSelect, guideRowsInput, blankRowsInput, titleInput, textColorInput, optParagraphIndent, optDialogueBreak].forEach(el => {
  el.addEventListener('input', debouncedRender);
  el.addEventListener('change', debouncedRender);
});

fontGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.font-btn');
  if (!btn) return;
  fontGroup.querySelector('.active').classList.remove('active');
  btn.classList.add('active');
  render();
});

printBtn.addEventListener('click', () => {
  if (!output.children.length) render();

  // 현재 화면이 iframe 내부(미리보기 환경)인지 확인
  if (window !== window.top) {
    printModal.style.display = 'flex';
  } else {
    // 실제 웹 브라우저 환경일 경우 정상 인쇄 실행
    window.print();
  }
});

closeModalBtn.addEventListener('click', () => {
  printModal.style.display = 'none';
});

// Initial render
render();
