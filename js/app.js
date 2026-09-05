// ===================== 십자가성경 앱 로직 =====================
const state = {
  version: 'gaeyeok',
  book: 1,
  chapter: 1,
  compareKeys: [],
  loaded: new Set(),
  ttsSpeaking: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function verseKey(b, c, v) { return `${b}_${c}_${v}`; }

// ---------- 버전 데이터 로딩 (동적 script 태그, file:// 에서도 동작) ----------
function loadVersion(key) {
  if (window.BIBLE_DATA && window.BIBLE_DATA[key]) return Promise.resolve();
  if (state.loaded.has(key)) return Promise.resolve();
  const meta = window.VERSIONS.find(v => v.key === key);
  if (!meta) return Promise.reject(new Error('알 수 없는 버전: ' + key));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = meta.file;
    s.onload = () => { state.loaded.add(key); resolve(); };
    s.onerror = () => reject(new Error('데이터 로드 실패: ' + meta.file));
    document.body.appendChild(s);
  });
}

function getVerseText(versionKey, b, c, v) {
  const data = window.BIBLE_DATA && window.BIBLE_DATA[versionKey];
  if (!data) return null;
  const book = data[b - 1];
  if (!book) return null;
  const ch = book[c - 1];
  if (!ch) return null;
  return ch[v - 1] != null ? ch[v - 1] : null;
}

function getBookMeta(b) { return window.BOOKS[b - 1]; }

// ---------- 사이드바 ----------
function renderSidebar() {
  const nav = $('#sidebar');
  nav.innerHTML = '';
  const otLabel = document.createElement('div');
  otLabel.className = 'testament-label';
  otLabel.textContent = '구약';
  nav.appendChild(otLabel);

  window.BOOKS.forEach((book, idx) => {
    if (book.num === 40) {
      const ntLabel = document.createElement('div');
      ntLabel.className = 'testament-label';
      ntLabel.textContent = '신약';
      nav.appendChild(ntLabel);
    }
    const item = document.createElement('div');
    item.className = 'book-item';
    item.textContent = book.name;
    item.dataset.book = book.num;
    item.addEventListener('click', () => toggleBookGrid(book.num));
    nav.appendChild(item);

    const grid = document.createElement('div');
    grid.className = 'chapter-grid';
    grid.id = 'chgrid-' + book.num;
    book.verses.forEach((_, ci) => {
      const chip = document.createElement('div');
      chip.className = 'chapter-chip';
      chip.textContent = ci + 1;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo(book.num, ci + 1);
        if (window.innerWidth <= 800) toggleSidebar(false);
      });
      grid.appendChild(chip);
    });
    nav.appendChild(grid);
  });
}

function toggleSidebar(forceOpen) {
  const sb = $('#sidebar');
  const bd = $('#sidebarBackdrop');
  const shouldOpen = forceOpen !== undefined ? forceOpen : !sb.classList.contains('open');
  sb.classList.toggle('open', shouldOpen);
  bd.classList.toggle('open', shouldOpen);
}

function toggleBookGrid(bookNum) {
  const grid = $('#chgrid-' + bookNum);
  const isOpen = grid.classList.contains('open');
  $$('.chapter-grid.open').forEach(g => g.classList.remove('open'));
  $$('.book-item.active').forEach(b => b.classList.remove('active'));
  if (!isOpen) {
    grid.classList.add('open');
    $(`.book-item[data-book="${bookNum}"]`).classList.add('active');
  }
}

function markActiveNav() {
  $$('.book-item.active').forEach(b => b.classList.remove('active'));
  $$('.chapter-chip.active').forEach(c => c.classList.remove('active'));
  const bi = $(`.book-item[data-book="${state.book}"]`);
  if (bi) bi.classList.add('active');
  const grid = $('#chgrid-' + state.book);
  if (grid) {
    grid.classList.add('open');
    const chip = grid.children[state.chapter - 1];
    if (chip) chip.classList.add('active');
  }
}

// ---------- 이동 ----------
async function goTo(book, chapter, verse) {
  state.book = book;
  state.chapter = chapter;
  await BibleDB.put('settings', { key: 'lastPos', value: { book, chapter } });
  await loadVersion(state.version);
  await renderChapter();
  markActiveNav();
  if (verse) {
    setTimeout(() => {
      const el = document.querySelector(`.verse[data-v="${verse}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.background = 'rgba(156,59,46,0.15)';
        setTimeout(() => { el.style.background = ''; }, 1600);
      }
    }, 60);
  } else {
    $('#reading').scrollTop = 0;
  }
  if ($('#overlayCompare').classList.contains('open')) renderCompare();
}

// ---------- 본문 렌더링 ----------
async function renderChapter() {
  const reading = $('#reading');
  const bookMeta = getBookMeta(state.book);
  const verses = getVerseTextArray();
  if (!verses) {
    reading.innerHTML = '<div class="loading-msg">본문을 불러올 수 없습니다.</div>';
    return;
  }
  const maxCh = bookMeta.verses.length;

  let html = `
    <h2 class="chapter-heading">${bookMeta.name} ${state.chapter}장</h2>
    <div class="chapter-sub">
      <button class="chapter-nav-btn" id="prevChBtn" ${state.chapter <= 1 ? 'disabled' : ''}>← 이전 장</button>
      <button class="chapter-nav-btn" id="nextChBtn" ${state.chapter >= maxCh ? 'disabled' : ''}>다음 장 →</button>
      <span>${window.VERSIONS.find(v => v.key === state.version).label}</span>
    </div>
  `;

  verses.forEach((text, i) => {
    const v = i + 1;
    const vk = verseKey(state.book, state.chapter, v);
    html += `
      <div class="verse" data-v="${v}" data-vk="${vk}">
        <div class="vnum">${v}</div>
        <div class="vtext"><span class="vtext-mark">${escapeHtml(text)}</span></div>
        <div class="vtools">
          <button class="vtool bm" data-act="bm" title="즐겨찾기">★</button>
          <button class="vtool hl" data-act="hl" title="하이라이트">✎</button>
          <button class="vtool note" data-act="note" title="메모">✐</button>
          <button class="vtool xref" data-act="xref" title="관주">§</button>
        </div>
      </div>
      <div class="verse-detail" id="detail-${vk}">
        <div class="detail-tabs">
          <button data-tab="xref" class="active">관주</button>
          <button data-tab="note">메모</button>
        </div>
        <div class="detail-pane xref-pane active"></div>
        <div class="detail-pane note-pane"><textarea placeholder="이 절에 대한 한 줄 메모..."></textarea></div>
      </div>
    `;
  });

  reading.innerHTML = html;
  $('#prevChBtn')?.addEventListener('click', () => {
    if (state.chapter > 1) goTo(state.book, state.chapter - 1);
  });
  $('#nextChBtn')?.addEventListener('click', () => {
    if (state.chapter < maxCh) goTo(state.book, state.chapter + 1);
  });

  wireVerseEvents();
  await applySavedStates();
}

function getVerseTextArray() {
  const data = window.BIBLE_DATA[state.version];
  if (!data) return null;
  const book = data[state.book - 1];
  if (!book) return null;
  return book[state.chapter - 1] || [];
}

function wireVerseEvents() {
  $$('.verse .vnum').forEach(el => {
    el.addEventListener('click', () => {
      const row = el.closest('.verse');
      openDetail(row.dataset.vk, 'xref', row);
    });
  });
  $$('.vtool').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.verse');
      const vk = row.dataset.vk;
      const act = btn.dataset.act;
      if (act === 'bm') await toggleBookmark(vk, row, btn);
      else if (act === 'hl') await cycleHighlight(vk, row, btn);
      else if (act === 'note') openDetail(vk, 'note', row);
      else if (act === 'xref') openDetail(vk, 'xref', row);
    });
  });
  $$('.detail-tabs button').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const detail = tabBtn.closest('.verse-detail');
      $$('.detail-tabs button', detail).forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      $$('.detail-pane', detail).forEach(p => p.classList.remove('active'));
      $(`.${tabBtn.dataset.tab}-pane`, detail).classList.add('active');
    });
  });
  $$('.note-pane textarea').forEach(ta => {
    let timer;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveNote(ta), 500);
    });
    ta.addEventListener('blur', () => saveNote(ta));
  });
}

function openDetail(vk, tab, row) {
  const detail = $('#detail-' + vk);
  const isOpen = detail.classList.contains('open');
  if (isOpen && detail.dataset.currentTab === tab) {
    detail.classList.remove('open');
    row.classList.remove('expanded');
    return;
  }
  detail.classList.add('open');
  detail.dataset.currentTab = tab;
  row.classList.add('expanded');
  $$('.detail-tabs button', detail).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.detail-pane', detail).forEach(p => p.classList.toggle('active', p.classList.contains(tab + '-pane')));
  if (tab === 'xref') renderXref(vk, detail);
}

function renderXref(vk, detail) {
  const pane = $('.xref-pane', detail);
  const [b, c, v] = vk.split('_').map(Number);
  const refs = (window.XREF[b - 1] && window.XREF[b - 1][c - 1] && window.XREF[b - 1][c - 1][v - 1]) || [];
  if (!refs.length) {
    pane.innerHTML = '<div class="empty-msg" style="padding:8px 0;">연결된 관주가 없습니다.</div>';
    return;
  }
  pane.innerHTML = refs.map(([rb, rc, rv]) => {
    const rm = getBookMeta(rb);
    const txt = getVerseText(state.version, rb, rc, rv);
    return `<div class="xref-item">
      <span class="xref-ref" data-b="${rb}" data-c="${rc}" data-v="${rv}">${rm ? rm.name : rb} ${rc}:${rv}</span>
      <div class="xref-text">${txt ? escapeHtml(txt) : ''}</div>
    </div>`;
  }).join('');
  $$('.xref-ref', pane).forEach(el => {
    el.addEventListener('click', () => {
      closeAllOverlays();
      goTo(Number(el.dataset.b), Number(el.dataset.c), Number(el.dataset.v));
    });
  });
}

async function saveNote(ta) {
  const detail = ta.closest('.verse-detail');
  const vk = detail.id.replace('detail-', '');
  const text = ta.value.trim();
  if (text) {
    await BibleDB.put('notes', { verseKey: vk, text, updatedAt: Date.now() });
  } else {
    await BibleDB.del('notes', vk);
  }
  updateNoteIcon(vk, !!text);
}

function updateNoteIcon(vk, hasNote) {
  const row = document.querySelector(`.verse[data-vk="${vk}"] .vtool.note`);
  if (row) row.classList.toggle('on', hasNote);
}

async function toggleBookmark(vk, row, btn) {
  const existing = await BibleDB.get('bookmarks', vk);
  if (existing) {
    await BibleDB.del('bookmarks', vk);
    btn.classList.remove('on');
  } else {
    const [b, c, v] = vk.split('_').map(Number);
    const text = $('.vtext', row).textContent;
    await BibleDB.put('bookmarks', {
      verseKey: vk, book: b, chapter: c, verse: v,
      snippet: text.slice(0, 80), addedAt: Date.now()
    });
    btn.classList.add('on');
  }
}

const HL_CYCLE = [null, 'yellow', 'green', 'pink'];
async function cycleHighlight(vk, row, btn) {
  const existing = await BibleDB.get('highlights', vk);
  const current = existing ? existing.color : null;
  const idx = HL_CYCLE.indexOf(current);
  const next = HL_CYCLE[(idx + 1) % HL_CYCLE.length];
  HL_CYCLE.forEach(c => { if (c) row.classList.remove('hl-' + c); });
  if (next) {
    row.classList.add('hl-' + next);
    await BibleDB.put('highlights', { verseKey: vk, color: next, addedAt: Date.now() });
  } else {
    await BibleDB.del('highlights', vk);
  }
}

async function applySavedStates() {
  const rows = $$('.verse');
  await Promise.all(rows.map(async row => {
    const vk = row.dataset.vk;
    const [note, bm, hl] = await Promise.all([
      BibleDB.get('notes', vk), BibleDB.get('bookmarks', vk), BibleDB.get('highlights', vk)
    ]);
    if (note) $(`.verse[data-vk="${vk}"] .vtool.note`).classList.add('on');
    if (note) { const ta = $('#detail-' + vk + ' .note-pane textarea'); if (ta) ta.value = note.text; }
    if (bm) $(`.verse[data-vk="${vk}"] .vtool.bm`).classList.add('on');
    if (hl) row.classList.add('hl-' + hl.color);
  }));
}

// ---------- 검색 ----------
async function doSearch() {
  const term = $('#searchInput').value.trim();
  if (!term) return;
  await loadVersion(state.version);
  const data = window.BIBLE_DATA[state.version];
  const results = [];
  for (let b = 0; b < 66 && results.length < 300; b++) {
    const book = data[b];
    if (!book) continue;
    for (let c = 0; c < book.length && results.length < 300; c++) {
      const ch = book[c];
      if (!ch) continue;
      for (let v = 0; v < ch.length && results.length < 300; v++) {
        const text = ch[v];
        if (text && text.includes(term)) {
          results.push({ b: b + 1, c: c + 1, v: v + 1, text });
        }
      }
    }
  }
  renderSearchResults(term, results);
  openOverlay('overlaySearch');
}

function renderSearchResults(term, results) {
  const box = $('#searchResults');
  if (!results.length) {
    box.innerHTML = `<div class="empty-msg">"${escapeHtml(term)}"에 대한 검색 결과가 없습니다.</div>`;
    return;
  }
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  box.innerHTML = `<div style="font-size:12px;color:var(--ink-soft);margin-bottom:10px;">${results.length}건 (최대 300건 표시)</div>` +
    results.map(r => {
      const bm = getBookMeta(r.b);
      const snippet = escapeHtml(r.text).replace(re, m => `<mark>${m}</mark>`);
      return `<div class="result-row" data-b="${r.b}" data-c="${r.c}" data-v="${r.v}">
        <span class="loc">${bm.name} ${r.c}:${r.v}</span>
        <span class="snippet">${snippet}</span>
      </div>`;
    }).join('');
  $$('.result-row', box).forEach(row => {
    row.addEventListener('click', () => {
      closeAllOverlays();
      goTo(Number(row.dataset.b), Number(row.dataset.c), Number(row.dataset.v));
    });
  });
}

// ---------- 버전 비교 ----------
function renderComparePicker() {
  const box = $('#comparePicker');
  box.innerHTML = window.VERSIONS.map(v => `
    <label><input type="checkbox" value="${v.key}" ${state.compareKeys.includes(v.key) ? 'checked' : ''}> ${v.label}</label>
  `).join('');
  $$('#comparePicker input').forEach(cb => {
    cb.addEventListener('change', async () => {
      if (cb.checked) {
        if (state.compareKeys.length >= 4) { cb.checked = false; alert('최대 4개 버전까지 비교할 수 있습니다.'); return; }
        state.compareKeys.push(cb.value);
      } else {
        state.compareKeys = state.compareKeys.filter(k => k !== cb.value);
      }
      await BibleDB.put('settings', { key: 'compareKeys', value: state.compareKeys });
      renderCompare();
    });
  });
}

async function renderCompare() {
  const grid = $('#compareGrid');
  if (!state.compareKeys.length) {
    grid.innerHTML = '<div class="empty-msg">비교할 번역본을 선택해 주세요 (최대 4개).</div>';
    return;
  }
  grid.innerHTML = '<div class="loading-msg">불러오는 중...</div>';
  await Promise.all(state.compareKeys.map(loadVersion));
  const bookMeta = getBookMeta(state.book);
  const verseCount = Math.max(...state.compareKeys.map(k => {
    const d = window.BIBLE_DATA[k];
    return (d && d[state.book - 1] && d[state.book - 1][state.chapter - 1] || []).length;
  }));
  let html = `<div style="font-family:var(--font-serif);font-weight:700;font-size:16px;margin-bottom:10px;">${bookMeta.name} ${state.chapter}장</div>`;
  for (let v = 1; v <= verseCount; v++) {
    html += `<div class="compare-verse"><div class="vn">${v}절</div><div class="compare-cols">`;
    state.compareKeys.forEach(k => {
      const label = window.VERSIONS.find(x => x.key === k).label;
      const text = getVerseText(k, state.book, state.chapter, v);
      html += `<div class="compare-col"><div class="vlabel">${label}</div><div class="vbody">${text ? escapeHtml(text) : '<span style="opacity:.4">(해당 절 없음)</span>'}</div></div>`;
    });
    html += `</div></div>`;
  }
  grid.innerHTML = html;
}

// ---------- 매일 읽기 ----------
function buildReadingPlanIndex() {
  const flat = [];
  window.BOOKS.forEach(book => {
    book.verses.forEach((_, ci) => flat.push({ book: book.num, chapter: ci + 1 }));
  });
  const PLAN_DAYS = 365;
  // 1189개 장을 365일에 최대한 고르게 분배 (하루 3~4장)
  const days = [];
  let idx = 0;
  for (let d = 0; d < PLAN_DAYS; d++) {
    const remainingDays = PLAN_DAYS - d;
    const remainingChapters = flat.length - idx;
    const take = Math.ceil(remainingChapters / remainingDays);
    days.push(flat.slice(idx, idx + take));
    idx += take;
  }
  return days;
}
const READING_PLAN = buildReadingPlanIndex();

async function renderPlan() {
  const body = $('#planBody');
  let startSetting = await BibleDB.get('settings', 'planStart');
  if (!startSetting) {
    startSetting = { key: 'planStart', value: todayStr() };
    await BibleDB.put('settings', startSetting);
  }
  const start = new Date(startSetting.value + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  let dayIndex = Math.floor((today - start) / 86400000);
  const total = READING_PLAN.length;
  const finished = dayIndex >= total;
  dayIndex = Math.max(0, Math.min(dayIndex, total - 1));

  const progressRecords = await BibleDB.getAll('progress');
  const doneDays = new Set(progressRecords.filter(p => p.done).map(p => p.day));
  const todayDone = doneDays.has(dayIndex);
  const pct = Math.round((doneDays.size / total) * 100);

  const todays = READING_PLAN[dayIndex] || [];
  const listHtml = todays.map(item => {
    const bm = getBookMeta(item.book);
    return `<div class="plan-item" data-b="${item.book}" data-c="${item.chapter}">· ${bm.name} ${item.chapter}장</div>`;
  }).join('');

  body.innerHTML = `
    <div class="reading-plan-today">
      <h3>${finished ? '📗 1년 통독 완료!' : `Day ${dayIndex + 1} / ${total}`}</h3>
      ${finished ? '<div style="font-size:13px;">축하합니다, 형님! 계획을 다시 시작하시려면 아래 버튼을 눌러주세요.</div>' : listHtml}
      <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%"></div></div>
      <div class="streak-note">전체 진행률 ${pct}% · 완료한 날 ${doneDays.size}일 / ${total}일</div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        ${finished
          ? `<button class="chapter-nav-btn" id="restartPlanBtn">계획 다시 시작</button>`
          : `<button class="chapter-nav-btn" id="markDoneBtn">${todayDone ? '오늘 읽기 완료 ✓' : '오늘 읽기 완료로 표시'}</button>`
        }
      </div>
    </div>
  `;
  $$('.plan-item', body).forEach(el => {
    el.addEventListener('click', () => {
      closeAllOverlays();
      goTo(Number(el.dataset.b), Number(el.dataset.c));
    });
  });
  $('#markDoneBtn')?.addEventListener('click', async () => {
    await BibleDB.put('progress', { day: dayIndex, done: true, date: todayStr() });
    renderPlan();
  });
  $('#restartPlanBtn')?.addEventListener('click', async () => {
    if (!confirm('통독 계획을 오늘부터 다시 시작할까요? 진행 기록이 초기화됩니다.')) return;
    await BibleDB.put('settings', { key: 'planStart', value: todayStr() });
    const all = await BibleDB.getAll('progress');
    await Promise.all(all.map(p => BibleDB.del('progress', p.day)));
    renderPlan();
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- 즐겨찾기 목록 ----------
async function renderBookmarksList() {
  const body = $('#bookmarksBody');
  const list = await BibleDB.getAll('bookmarks');
  if (!list.length) {
    body.innerHTML = '<div class="empty-msg">저장된 즐겨찾기가 없습니다. 절 옆의 ★ 아이콘을 눌러 추가해 보세요.</div>';
    return;
  }
  list.sort((a, b) => b.addedAt - a.addedAt);
  body.innerHTML = list.map(item => {
    const bm = getBookMeta(item.book);
    return `<div class="bookmark-row" data-vk="${item.verseKey}" data-b="${item.book}" data-c="${item.chapter}" data-v="${item.verse}">
      <span class="loc">${bm.name} ${item.chapter}:${item.verse}</span>
      <span class="remove-bm" style="float:right;color:var(--ink-soft);cursor:pointer;">삭제</span>
      <div class="snippet">${escapeHtml(item.snippet)}</div>
    </div>`;
  }).join('');
  $$('.bookmark-row', body).forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-bm')) {
        e.stopPropagation();
        BibleDB.del('bookmarks', row.dataset.vk).then(renderBookmarksList);
        return;
      }
      closeAllOverlays();
      goTo(Number(row.dataset.b), Number(row.dataset.c), Number(row.dataset.v));
    });
  });
}

// ---------- 오버레이 공통 ----------
function openOverlay(id) {
  closeAllOverlays();
  $('#' + id).classList.add('open');
}
function closeAllOverlays() { $$('.overlay.open').forEach(o => o.classList.remove('open')); }

// ---------- TTS ----------
function toggleTTS() {
  if (state.ttsSpeaking) {
    speechSynthesis.cancel();
    state.ttsSpeaking = false;
    $('#btnTTS').classList.remove('active');
    return;
  }
  const verses = getVerseTextArray();
  if (!verses || !verses.length) return;
  const text = verses.join(' ');
  const utter = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const koVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
  if (koVoice) utter.voice = koVoice;
  utter.lang = 'ko-KR';
  utter.rate = 0.95;
  utter.onend = () => { state.ttsSpeaking = false; $('#btnTTS').classList.remove('active'); };
  speechSynthesis.speak(utter);
  state.ttsSpeaking = true;
  $('#btnTTS').classList.add('active');
}

// ---------- 폰트/테마 ----------
async function adjustFont(delta) {
  let size = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--verse-size')) || 17;
  size = Math.max(13, Math.min(26, size + delta));
  document.documentElement.style.setProperty('--verse-size', size + 'px');
  await BibleDB.put('settings', { key: 'fontSize', value: size });
}

async function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  $('#btnTheme').textContent = next === 'dark' ? '☀' : '☾';
  await BibleDB.put('settings', { key: 'theme', value: next });
}

// ---------- 날짜/시간 표시 ----------
function updateClock() {
  const el = $('#clockDisplay');
  if (!el) return;
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  let h12 = d.getHours() % 12; if (h12 === 0) h12 = 12;
  const ampm = d.getHours() < 12 ? '오전' : '오후';
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  el.textContent = `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일 (${days[d.getDay()]}) ${ampm} ${h12}:${mm}:${ss}`;
}

// ---------- 인쇄 ----------
function fillBookSelect(sel) {
  sel.innerHTML = window.BOOKS.map(b => `<option value="${b.num}">${b.name}</option>`).join('');
}
function fillChapterSelect(sel, bookNum) {
  const bm = getBookMeta(bookNum);
  sel.innerHTML = bm.verses.map((_, i) => `<option value="${i + 1}">${i + 1}장</option>`).join('');
}

function initPrintOverlay() {
  const vSel = $('#printVersion');
  vSel.innerHTML = window.VERSIONS.map(v => `<option value="${v.key}">${v.label}</option>`).join('');
  vSel.value = state.version;

  const sBook = $('#printStartBook'), sCh = $('#printStartChapter');
  const eBook = $('#printEndBook'), eCh = $('#printEndChapter');
  fillBookSelect(sBook); fillBookSelect(eBook);
  sBook.value = state.book; eBook.value = state.book;
  fillChapterSelect(sCh, state.book); fillChapterSelect(eCh, state.book);
  sCh.value = state.chapter; eCh.value = state.chapter;

  sBook.onchange = () => fillChapterSelect(sCh, Number(sBook.value));
  eBook.onchange = () => fillChapterSelect(eCh, Number(eBook.value));

  $$('input[name="printMode"]').forEach(r => {
    r.onchange = () => {
      $('#printRangeFields').style.display = ($('input[name="printMode"]:checked').value === 'range') ? 'block' : 'none';
    };
  });
  $('#printRangeFields').style.display = 'none';
  $$('input[name="printMode"]').forEach(r => r.checked = (r.value === 'current'));
}

function collectPrintRange(version, startB, startC, startV, endB, endC, endV) {
  // (startB,startC,startV) > (endB,endC,endV) 이면 서로 교환
  const a = [startB, startC, startV], b = [endB, endC, endV];
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  let [sB, sC, sV] = a, [eB, eC, eV] = b;
  if (cmp(a, b) > 0) { [sB, sC, sV] = b; [eB, eC, eV] = a; }

  const data = window.BIBLE_DATA[version];
  const out = [];
  for (let bn = sB; bn <= eB; bn++) {
    const bm = getBookMeta(bn);
    const chStart = (bn === sB) ? sC : 1;
    const chEnd = (bn === eB) ? eC : bm.verses.length;
    for (let cn = chStart; cn <= chEnd; cn++) {
      const maxV = bm.verses[cn - 1] || 0;
      const vStart = (bn === sB && cn === sC) ? Math.max(1, sV || 1) : 1;
      const vEnd = (bn === eB && cn === eC) ? Math.min(maxV, eV || maxV) : maxV;
      const chData = (data[bn - 1] && data[bn - 1][cn - 1]) || [];
      const items = [];
      for (let vn = vStart; vn <= vEnd; vn++) items.push({ verse: vn, text: chData[vn - 1] || '' });
      out.push({ book: bn, bookName: bm.name, chapter: cn, items });
    }
  }
  return out;
}

async function doPrint() {
  const mode = $('input[name="printMode"]:checked').value;
  const version = $('#printVersion').value;
  const includeNum = $('#printIncludeVerseNum').checked;
  await loadVersion(version);

  let sections;
  if (mode === 'current') {
    sections = collectPrintRange(version, state.book, state.chapter, 1, state.book, state.chapter, 9999);
  } else {
    const sB = Number($('#printStartBook').value), sC = Number($('#printStartChapter').value);
    const sVraw = $('#printStartVerse').value, eVraw = $('#printEndVerse').value;
    const eB = Number($('#printEndBook').value), eC = Number($('#printEndChapter').value);
    sections = collectPrintRange(version, sB, sC, sVraw ? Number(sVraw) : 1, eB, eC, eVraw ? Number(eVraw) : 9999);
  }

  const versionLabel = window.VERSIONS.find(v => v.key === version).label;
  const first = sections[0], last = sections[sections.length - 1];
  const rangeLabel = sections.length
    ? (first === last
        ? `${first.bookName} ${first.chapter}장`
        : `${first.bookName} ${first.chapter}장 ~ ${last.bookName} ${last.chapter}장`)
    : '';

  let html = `<div class="print-doc-title">십자가성경</div>
    <div class="print-doc-meta">${rangeLabel} · ${versionLabel} · 출력일시 ${todayStr()}</div>`;

  sections.forEach(sec => {
    html += `<div class="print-chapter-heading">${sec.bookName} ${sec.chapter}장</div>`;
    sec.items.forEach(it => {
      html += `<div class="print-verse">${includeNum ? `<span class="pvnum">${it.verse}</span>` : ''}${escapeHtml(it.text)}</div>`;
    });
  });

  $('#printArea').innerHTML = html;
  closeAllOverlays();
  setTimeout(() => window.print(), 100);
}

// ---------- 초기화 ----------
async function init() {
  // 버전 선택 드롭다운
  const sel = $('#versionSelect');
  sel.innerHTML = window.VERSIONS.map(v => `<option value="${v.key}">${v.label}</option>`).join('');
  sel.value = state.version;
  sel.addEventListener('change', async () => {
    state.version = sel.value;
    await BibleDB.put('settings', { key: 'lastVersion', value: state.version });
    await loadVersion(state.version);
    await renderChapter();
  });

  renderSidebar();

  // 저장된 설정 복원
  const [lastVersion, lastPos, fontSize, theme, compareKeys] = await Promise.all([
    BibleDB.get('settings', 'lastVersion'),
    BibleDB.get('settings', 'lastPos'),
    BibleDB.get('settings', 'fontSize'),
    BibleDB.get('settings', 'theme'),
    BibleDB.get('settings', 'compareKeys'),
  ]);
  if (lastVersion) { state.version = lastVersion.value; sel.value = state.version; }
  if (fontSize) document.documentElement.style.setProperty('--verse-size', fontSize.value + 'px');
  if (theme) { document.documentElement.dataset.theme = theme.value; $('#btnTheme').textContent = theme.value === 'dark' ? '☀' : '☾'; }
  if (compareKeys) state.compareKeys = compareKeys.value;

  await loadVersion(state.version);
  if (lastPos) await goTo(lastPos.value.book, lastPos.value.chapter);
  else await goTo(1, 1);

  // 이벤트 바인딩
  $('#searchBtn').addEventListener('click', doSearch);
  $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  $('#btnCompare').addEventListener('click', () => { renderComparePicker(); renderCompare(); openOverlay('overlayCompare'); });
  $('#btnPrint').addEventListener('click', () => { initPrintOverlay(); openOverlay('overlayPrint'); });
  $('#printGoBtn').addEventListener('click', doPrint);
  $('#btnPlan').addEventListener('click', () => { renderPlan(); openOverlay('overlayPlan'); });
  $('#btnBookmarks').addEventListener('click', () => { renderBookmarksList(); openOverlay('overlayBookmarks'); });
  $('#btnTTS').addEventListener('click', toggleTTS);
  $('#btnFontMinus').addEventListener('click', () => adjustFont(-1));
  $('#btnFontPlus').addEventListener('click', () => adjustFont(1));
  $('#btnTheme').addEventListener('click', toggleTheme);

  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => $('#' + btn.dataset.close).classList.remove('open')));
  $$('.overlay').forEach(ov => ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); }));

  if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => {};

  $('#btnMenu').addEventListener('click', () => toggleSidebar());
  $('#sidebarBackdrop').addEventListener('click', () => toggleSidebar(false));

  updateClock();
  setInterval(updateClock, 1000);

  // 서비스워커 등록 (http/https로 열었을 때만 동작, file://에서는 자동으로 무시됨)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
