const DIARY_DATES = [
  { date: '2026-08-10', label: '8월 10일', day: '월', note: '대학생 참여자 사전모임', group: 'pre', tone: 0 },
  { date: '2026-08-13', label: '8월 13일', day: '목', note: '세움 측 참여자 사전모임', group: 'pre', tone: 1 },
  { date: '2026-08-22', label: '8월 22일', day: '토', note: '1회차', group: 'class', tone: 2 },
  { date: '2026-08-29', label: '8월 29일', day: '토', note: '2회차', group: 'class', tone: 3 },
  { date: '2026-09-05', label: '9월 5일', day: '토', note: '3회차', group: 'class', tone: 4 },
  { date: '2026-09-12', label: '9월 12일', day: '토', note: '4회차', group: 'class', tone: 5 },
  { date: '2026-09-19', label: '9월 19일', day: '토', note: '5회차', group: 'class', tone: 0 },
];

const BOOK_GROUPS = [
  { id: 'pre', title: '사전모임' },
  { id: 'class', title: '프로그램' },
];

const WRITE_PASSWORD = '7968';
const WRITE_AUTH_KEY = 'diary-write-auth';
const ADMIN_PASSWORD = '9650';
const ADMIN_AUTH_KEY = 'diary-admin-auth';

const screens = {
  main: document.getElementById('mainView'),
  password: document.getElementById('passwordView'),
  adminPassword: document.getElementById('adminPasswordView'),
  admin: document.getElementById('adminView'),
  date: document.getElementById('dateView'),
  write: document.getElementById('writeView'),
  bookSelect: document.getElementById('bookSelectView'),
  read: document.getElementById('readView'),
};

let db = null;
let currentDate = null;
let readDate = null;
let currentPage = 0;
let totalPages = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchMovedVertically = false;
let skipBookClick = false;
let isFlipping = false;
const FLIP_MS = 680;
let passwordMode = 'write';

function isMobileReader() {
  return window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;
}

function initSupabase() {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase?.createClient) {
    showToast('Supabase 라이브러리를 불러오지 못했습니다');
    return null;
  }
  if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_') || cfg.anonKey.includes('YOUR_')) {
    showToast('config.js에 Supabase URL과 키를 넣어주세요');
    return null;
  }
  try {
    return window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch (err) {
    console.error(err);
    showToast('Supabase 연결에 실패했습니다');
    return null;
  }
}

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    if (!screens[key]) return;
    screens[key].classList.toggle('hidden', key !== name);
  });
  const fab = document.getElementById('btnAdmin');
  fab.classList.toggle('hidden', name !== 'main');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function formatDateLabel(info) {
  const [, m, d] = info.date.split('-');
  const base = `2026년 ${parseInt(m)}월 ${parseInt(d)}일 (${info.day})`;
  return info.note ? `${base} · ${info.note}` : base;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function dateMeta(dateStr) {
  return DIARY_DATES.find((d) => d.date === dateStr) || { date: dateStr, label: dateStr, day: '', tone: 0 };
}

function coverMonthDay(dateStr) {
  const [, m, d] = dateStr.split('-');
  return { month: `${parseInt(m)}월`, day: `${parseInt(d)}` };
}

async function saveEntry(data) {
  if (!db) throw new Error('Supabase가 설정되지 않았습니다');

  const { data: row, error } = await db
    .from('diary_entries')
    .insert({
      date: data.date,
      name: data.name,
      content: data.content,
      satisfaction: data.satisfaction,
    })
    .select()
    .single();

  if (error) throw error;
  return row;
}

async function getEntriesByDate(date) {
  if (!db) return [];

  const { data, error } = await db
    .from('diary_entries')
    .select('id, date, name, content, satisfaction, created_at')
    .eq('date', date)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const meta = dateMeta(date);
  return (data || []).map((e) => ({
    id: e.id,
    name: e.name,
    content: e.content,
    satisfaction: e.satisfaction,
    createdAt: e.created_at,
    date: e.date,
    dateLabel: meta.note ? `${meta.label} (${meta.note})` : meta.label,
    day: meta.day,
    note: meta.note || '',
  }));
}

async function getAllEntries() {
  if (!db) return [];

  const { data, error } = await db
    .from('diary_entries')
    .select('id, date, name, content, satisfaction, created_at')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const allowed = new Set(DIARY_DATES.map((d) => d.date));
  return (data || [])
    .filter((e) => allowed.has(e.date))
    .map((e) => {
      const meta = dateMeta(e.date);
      return {
        id: e.id,
        name: e.name,
        content: e.content,
        satisfaction: e.satisfaction,
        createdAt: e.created_at,
        date: e.date,
        dateLabel: meta.note ? `${meta.label} (${meta.note})` : meta.label,
        day: meta.day,
      };
    });
}

async function getEntryCounts() {
  if (!db) return {};

  const { data, error } = await db
    .from('diary_entries')
    .select('date');

  if (error) throw error;

  const counts = {};
  (data || []).forEach((row) => {
    counts[row.date] = (counts[row.date] || 0) + 1;
  });
  return counts;
}

async function deleteEntries(ids) {
  if (!db) throw new Error('Supabase가 설정되지 않았습니다');
  const { error } = await db
    .from('diary_entries')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

function openPasswordScreen(mode) {
  passwordMode = mode;
  document.getElementById('passwordViewTitle').textContent = mode === 'write' ? '일기 쓰기' : '일기 읽기';
  document.getElementById('passwordViewDesc').textContent = mode === 'write'
    ? '작성하려면 비밀번호를 입력해 주세요'
    : '읽으려면 비밀번호를 입력해 주세요';
  document.getElementById('passwordForm').reset();
  showScreen('password');
  setTimeout(() => document.getElementById('inputPassword').focus(), 100);
}

function openWriteGate() {
  if (sessionStorage.getItem(WRITE_AUTH_KEY) === '1') {
    openDateSelect();
    return;
  }
  openPasswordScreen('write');
}

function openReadGate() {
  if (sessionStorage.getItem(WRITE_AUTH_KEY) === '1') {
    openBookSelect();
    return;
  }
  openPasswordScreen('read');
}

function openAdminGate() {
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) === '1') {
    openAdmin();
    return;
  }
  document.getElementById('adminPasswordForm').reset();
  showScreen('adminPassword');
  setTimeout(() => document.getElementById('inputAdminPassword').focus(), 100);
}

function openDateSelect() {
  const list = document.getElementById('datePickerList');
  list.innerHTML = BOOK_GROUPS.map((group) => {
    const dates = DIARY_DATES.filter((d) => d.group === group.id);
    return `
      <div class="date-group">
        <p class="date-group-title">${group.title}</p>
        ${dates.map((d) => `
          <button type="button" class="date-pick-btn" data-date="${d.date}">
            <span class="date-pick-main">
              <span class="date-pick-label">${d.label}</span>
              ${d.note ? `<span class="date-pick-note">${d.note}</span>` : ''}
            </span>
            <span class="date-pick-day">${d.day}요일</span>
          </button>
        `).join('')}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.date-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const info = DIARY_DATES.find((d) => d.date === btn.dataset.date);
      openWrite(btn.dataset.date, info);
    });
  });

  showScreen('date');
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function openWrite(date, info) {
  currentDate = date;
  document.getElementById('writeDateLabel').textContent = formatDateLabel(info);

  const form = document.getElementById('diaryForm');
  form.reset();
  document.getElementById('inputSatisfaction').value = '';
  document.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));

  const contentInput = document.getElementById('inputContent');
  autoResizeTextarea(contentInput);

  showScreen('write');
  setTimeout(() => document.getElementById('inputName').focus(), 100);
}

function buildPageContent(entry) {
  if (entry.type === 'cover') {
    return `<div class="page-cover${entry.coverImage ? ' page-cover-photo' : ''}">
      <div class="page-cover-top">
        <p class="page-cover-eyebrow">전시연계프로그램</p>
        <p class="page-cover-program">&lt;ON AIR: 규칙을 찾아라!&gt;</p>
        <p class="page-cover-title">참여자 관찰 일지</p>
      </div>
      ${entry.coverImage ? `
        <div class="page-cover-media">
          <img src="${escapeHtml(entry.coverImage)}" alt="" class="page-cover-img">
        </div>
      ` : ''}
      ${entry.subtitle ? `<p class="page-cover-sub">${escapeHtml(entry.subtitle)}</p>` : ''}
    </div>`;
  }
  if (entry.type === 'empty') {
    return `<div class="page-empty">
      <div class="page-empty-icon">📖</div>
      <p>아직 작성된 일기가 없어요<br>일기 쓰기에서 남겨보세요</p>
    </div>`;
  }
  if (entry.type === 'error') {
    return `<div class="page-empty">
      <div class="page-empty-icon">⚠️</div>
      <p>일기를 불러오지 못했어요<br>잠시 후 다시 시도해 주세요</p>
    </div>`;
  }
  return `<div class="page-date-tag">${escapeHtml(entry.dateLabel)} · ${entry.day}요일</div>
    <div class="page-author">${escapeHtml(entry.name)}</div>
    <div class="page-emoji">${entry.satisfaction}</div>
    <div class="page-body">${escapeHtml(entry.content)}</div>`;
}

async function loadBook(date) {
  const meta = dateMeta(date);
  readDate = date;
  document.getElementById('readTitle').textContent = meta.label;

  const track = document.getElementById('bookTrack');
  isFlipping = false;
  track.innerHTML = `<div class="book-page"><div class="page-front"><div class="page-scroll"><div class="page-empty"><p>불러오는 중…</p></div></div></div></div>`;
  totalPages = 1;
  currentPage = 0;
  goToPage(0, false);

  let pages = [{
    type: 'cover',
    subtitle: [meta.label, meta.note].filter(Boolean).join(' · '),
    coverImage: date === '2026-08-10' ? 'pic.JPG' : '',
  }];

  try {
    const entries = await getEntriesByDate(date);
    if (entries.length === 0) {
      pages.push({ type: 'empty' });
    } else {
      entries.forEach((e) => pages.push(e));
    }
  } catch (err) {
    console.error(err);
    pages.push({ type: 'error' });
    showToast('일기 불러오기에 실패했습니다');
  }

  totalPages = pages.length;
  currentPage = 0;
  track.innerHTML = pages.map((entry, i) =>
    `<div class="book-page" data-index="${i}">
      <div class="page-front"><div class="page-scroll">${buildPageContent(entry)}</div></div>
      <div class="page-back" aria-hidden="true"></div>
    </div>`
  ).join('');
  goToPage(0, false);
}

function syncPageLayers(animateFrom) {
  const pages = [...document.querySelectorAll('#bookTrack .book-page')];
  pages.forEach((page, i) => {
    const flipped = i < currentPage;
    page.classList.toggle('is-flipped', flipped);
    page.classList.toggle('is-current', i === currentPage);
    page.classList.remove('is-turning-forward', 'is-turning-back');

    if (animateFrom != null) {
      if (animateFrom < currentPage && i === animateFrom) {
        page.classList.add('is-turning-forward');
        page.style.zIndex = String(totalPages + 30);
      } else if (animateFrom > currentPage && i === currentPage) {
        page.classList.add('is-turning-back');
        page.style.zIndex = String(totalPages + 30);
      } else {
        page.style.zIndex = flipped ? String(i + 1) : String(totalPages - i + 10);
      }
    } else {
      page.style.zIndex = flipped ? String(i + 1) : String(totalPages - i + 10);
    }
  });
}

function goToPage(index, animate = true) {
  if (index < 0 || index >= totalPages) return;
  if (isMobileReader()) animate = false;
  if (animate && (isFlipping || index === currentPage)) return;

  const from = currentPage;
  currentPage = index;

  const bookViewport = document.getElementById('bookViewport');

  if (!animate) {
    bookViewport.classList.remove('is-flipping');
    syncPageLayers(null);
  } else {
    isFlipping = true;
    bookViewport.classList.add('is-flipping');
    syncPageLayers(from);
    window.setTimeout(() => {
      isFlipping = false;
      bookViewport.classList.remove('is-flipping');
      syncPageLayers(null);
    }, FLIP_MS);
  }

  document.getElementById('bookPageNum').textContent = `${currentPage + 1} / ${totalPages}`;
  document.getElementById('btnBookPrev').disabled = currentPage === 0 || isFlipping;
  document.getElementById('btnBookNext').disabled = currentPage >= totalPages - 1 || isFlipping;

  const activeScroller = document.querySelector(`#bookTrack .book-page[data-index="${currentPage}"] .page-scroll`);
  if (activeScroller) activeScroller.scrollTop = 0;

  if (animate) {
    window.setTimeout(() => {
      document.getElementById('btnBookPrev').disabled = currentPage === 0;
      document.getElementById('btnBookNext').disabled = currentPage >= totalPages - 1;
    }, FLIP_MS);
  }
}

async function openBookSelect() {
  if (sessionStorage.getItem(WRITE_AUTH_KEY) !== '1') {
    openReadGate();
    return;
  }

  const shelf = document.getElementById('bookShelf');
  shelf.innerHTML = `<p class="shelf-loading">불러오는 중…</p>`;
  showScreen('bookSelect');

  let counts = {};
  try {
    counts = await getEntryCounts();
  } catch (err) {
    console.error(err);
    showToast('책 목록을 불러오지 못했습니다');
  }

  function renderCover(d) {
    const count = counts[d.date] || 0;
    const md = coverMonthDay(d.date);
    return `
      <button type="button" class="cover-book tone-${d.tone}" data-date="${d.date}">
        <span class="cover-book-spine"></span>
        <span class="cover-book-face">
          <span class="cover-book-month">${md.month}</span>
          <span class="cover-book-day">${md.day}</span>
          <span class="cover-book-weekday">${d.day}요일</span>
          ${d.note ? `<span class="cover-book-note">${d.note}</span>` : ''}
          <span class="cover-book-count">${count}편</span>
        </span>
      </button>
    `;
  }

  shelf.innerHTML = BOOK_GROUPS.map((group) => {
    const dates = DIARY_DATES.filter((d) => d.group === group.id);
    return `
      <section class="shelf-section">
        <h2 class="shelf-section-title">${group.title}</h2>
        <div class="shelf-grid">
          ${dates.map(renderCover).join('')}
        </div>
      </section>
    `;
  }).join('');

  shelf.querySelectorAll('.cover-book').forEach((btn) => {
    btn.addEventListener('click', async () => {
      showScreen('read');
      await loadBook(btn.dataset.date);
    });
  });
}

function updateAdminDeleteState() {
  const checked = document.querySelectorAll('#adminList input[type="checkbox"]:checked').length;
  const btn = document.getElementById('btnAdminDelete');
  btn.disabled = checked === 0;
  btn.textContent = checked > 0 ? `선택 삭제 (${checked})` : '선택 삭제';
}

async function openAdmin() {
  const list = document.getElementById('adminList');
  const selectAll = document.getElementById('adminSelectAll');
  selectAll.checked = false;
  list.innerHTML = `<p class="shelf-loading">불러오는 중…</p>`;
  showScreen('admin');
  updateAdminDeleteState();

  try {
    const entries = await getAllEntries();
    if (entries.length === 0) {
      list.innerHTML = `<p class="shelf-loading">삭제할 일기가 없습니다</p>`;
      return;
    }

    list.innerHTML = entries.map((e) => `
      <label class="admin-item">
        <input type="checkbox" value="${e.id}">
        <span class="admin-item-body">
          <span class="admin-item-top">
            <span class="admin-item-name">${escapeHtml(e.name)} ${e.satisfaction}</span>
            <span class="admin-item-date">${escapeHtml(e.dateLabel)}</span>
          </span>
          <span class="admin-item-content">${escapeHtml(e.content)}</span>
        </span>
      </label>
    `).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.addEventListener('change', () => {
        const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
        selectAll.checked = boxes.length > 0 && boxes.every((b) => b.checked);
        updateAdminDeleteState();
      });
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="shelf-loading">목록을 불러오지 못했습니다</p>`;
    showToast('관리 목록 불러오기 실패');
  }
}

document.getElementById('btnWrite').addEventListener('click', openWriteGate);
document.getElementById('btnRead').addEventListener('click', openReadGate);
document.getElementById('btnAdmin').addEventListener('click', openAdminGate);
document.getElementById('btnBackPassword').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackAdminPassword').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackAdmin').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackDate').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackWrite').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackBookSelect').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackRead').addEventListener('click', () => openBookSelect());

document.getElementById('passwordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('inputPassword').value.trim();
  if (value !== WRITE_PASSWORD) {
    showToast('비밀번호가 틀렸습니다');
    document.getElementById('inputPassword').value = '';
    document.getElementById('inputPassword').focus();
    return;
  }
  sessionStorage.setItem(WRITE_AUTH_KEY, '1');
  if (passwordMode === 'write') openDateSelect();
  else openBookSelect();
});

document.getElementById('adminPasswordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('inputAdminPassword').value.trim();
  if (value !== ADMIN_PASSWORD) {
    showToast('비밀번호가 틀렸습니다');
    document.getElementById('inputAdminPassword').value = '';
    document.getElementById('inputAdminPassword').focus();
    return;
  }
  sessionStorage.setItem(ADMIN_AUTH_KEY, '1');
  openAdmin();
});

document.getElementById('adminSelectAll').addEventListener('change', (e) => {
  document.querySelectorAll('#adminList input[type="checkbox"]').forEach((box) => {
    box.checked = e.target.checked;
  });
  updateAdminDeleteState();
});

document.getElementById('btnAdminDelete').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#adminList input[type="checkbox"]:checked')]
    .map((box) => box.value);
  if (ids.length === 0) return;
  if (!window.confirm(`${ids.length}개의 일기를 삭제할까요?`)) return;

  const btn = document.getElementById('btnAdminDelete');
  btn.disabled = true;
  try {
    await deleteEntries(ids);
    showToast('삭제되었습니다');
    await openAdmin();
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다');
    updateAdminDeleteState();
  }
});

document.querySelectorAll('.emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('inputSatisfaction').value = btn.dataset.emoji;
  });
});

document.getElementById('inputContent').addEventListener('input', (e) => {
  autoResizeTextarea(e.target);
});

document.getElementById('diaryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('inputName').value.trim();
  const content = document.getElementById('inputContent').value.trim();
  const satisfaction = document.getElementById('inputSatisfaction').value;
  const btn = document.getElementById('btnSubmit');

  if (!name || !content || !satisfaction) {
    showToast('모든 항목을 입력해 주세요');
    return;
  }

  btn.disabled = true;
  try {
    await saveEntry({ date: currentDate, name, content, satisfaction });
    showToast('제출되었습니다');
    showScreen('main');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다. 잠시 후 다시 시도해 주세요');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btnBookPrev').addEventListener('click', (e) => {
  e.stopPropagation();
  goToPage(currentPage - 1);
});

document.getElementById('btnBookNext').addEventListener('click', (e) => {
  e.stopPropagation();
  goToPage(currentPage + 1);
});

const viewport = document.getElementById('bookViewport');

if (!isMobileReader()) {
  viewport.addEventListener('click', (e) => {
    if (skipBookClick) {
      skipBookClick = false;
      return;
    }
    const scroller = e.target.closest('.page-scroll');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.55) goToPage(currentPage + 1);
    else if (x < rect.width * 0.45) goToPage(currentPage - 1);
  });

  viewport.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMovedVertically = false;
    skipBookClick = false;
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    const dy = e.touches[0].clientY - touchStartY;
    const dx = e.touches[0].clientX - touchStartX;
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      touchMovedVertically = true;
    }
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (touchMovedVertically || Math.abs(dy) > Math.abs(dx)) {
      skipBookClick = true;
      return;
    }

    if (Math.abs(dx) > 40) {
      skipBookClick = true;
      if (dx < 0) goToPage(currentPage + 1);
      else goToPage(currentPage - 1);
    }
  }, { passive: true });
}

db = initSupabase();
showScreen('main');
