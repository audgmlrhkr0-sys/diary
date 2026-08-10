const DIARY_DATES = [
  { date: '2026-08-10', label: '8월 10일', day: '월', note: '대학생 참여자 사전모임' },
  { date: '2026-08-13', label: '8월 13일', day: '목', note: '세움 측 참여자 사전모임' },
  { date: '2026-08-22', label: '8월 22일', day: '토' },
  { date: '2026-08-29', label: '8월 29일', day: '토' },
  { date: '2026-09-05', label: '9월 5일', day: '토' },
  { date: '2026-09-12', label: '9월 12일', day: '토' },
  { date: '2026-09-19', label: '9월 19일', day: '토' },
];

const WRITE_PASSWORD = '7968';
const WRITE_AUTH_KEY = 'diary-write-auth';

const screens = {
  main: document.getElementById('mainView'),
  password: document.getElementById('passwordView'),
  date: document.getElementById('dateView'),
  write: document.getElementById('writeView'),
  bookSelect: document.getElementById('bookSelectView'),
  read: document.getElementById('readView'),
};

let db = null;
let currentDate = null;
let readDate = null;
let currentPages = [];
let currentPage = 0;
let totalPages = 0;
let touchStartX = 0;

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
  return DIARY_DATES.find((d) => d.date === dateStr) || { date: dateStr, label: dateStr, day: '' };
}

function ensureWriteAuth() {
  if (sessionStorage.getItem(WRITE_AUTH_KEY) === '1') return true;
  const value = window.prompt('삭제를 위해 비밀번호를 입력해 주세요');
  if (value === null) return false;
  if (value.trim() !== WRITE_PASSWORD) {
    showToast('비밀번호가 틀렸습니다');
    return false;
  }
  sessionStorage.setItem(WRITE_AUTH_KEY, '1');
  return true;
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

async function deleteEntry(id) {
  if (!db) throw new Error('Supabase가 설정되지 않았습니다');

  const { error } = await db
    .from('diary_entries')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

function openWriteGate() {
  if (sessionStorage.getItem(WRITE_AUTH_KEY) === '1') {
    openDateSelect();
    return;
  }
  document.getElementById('passwordForm').reset();
  showScreen('password');
  setTimeout(() => document.getElementById('inputPassword').focus(), 100);
}

function openDateSelect() {
  const list = document.getElementById('datePickerList');
  list.innerHTML = DIARY_DATES.map((d) => `
    <button type="button" class="date-pick-btn" data-date="${d.date}">
      <span class="date-pick-main">
        <span class="date-pick-label">${d.label}</span>
        ${d.note ? `<span class="date-pick-note">${d.note}</span>` : ''}
      </span>
      <span class="date-pick-day">${d.day}요일</span>
    </button>
  `).join('');

  list.querySelectorAll('.date-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const info = DIARY_DATES.find((d) => d.date === btn.dataset.date);
      openWrite(btn.dataset.date, info);
    });
  });

  showScreen('date');
}

function openWrite(date, info) {
  currentDate = date;
  document.getElementById('writeDateLabel').textContent = formatDateLabel(info);

  const form = document.getElementById('diaryForm');
  form.reset();
  document.getElementById('inputSatisfaction').value = '';
  document.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));

  showScreen('write');
  setTimeout(() => document.getElementById('inputName').focus(), 100);
}

function buildPageContent(entry) {
  if (entry.type === 'cover') {
    return `<div class="page-cover">
      <p class="page-cover-eyebrow">전시연계프로그램</p>
      <p class="page-cover-program">&lt;ON AIR: 규칙을 찾아라!&gt;</p>
      <p class="page-cover-title">감상평 다이어리</p>
      ${entry.subtitle ? `<p class="page-cover-sub">${escapeHtml(entry.subtitle)}</p>` : ''}
      <p class="page-cover-sub">좌우로 넘겨 읽어보세요</p>
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
    <div class="page-body">${escapeHtml(entry.content)}</div>
    <button type="button" class="btn-delete" data-id="${entry.id}">삭제</button>`;
}

function bindDeleteButtons() {
  document.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      if (!ensureWriteAuth()) return;
      if (!window.confirm('이 일기를 삭제할까요?')) return;

      btn.disabled = true;
      try {
        await deleteEntry(id);
        showToast('삭제되었습니다');
        await loadBook(readDate);
      } catch (err) {
        console.error(err);
        showToast('삭제에 실패했습니다. SQL 삭제 정책을 확인해 주세요');
        btn.disabled = false;
      }
    });
  });
}

async function loadBook(date) {
  const meta = dateMeta(date);
  readDate = date;
  document.getElementById('readTitle').textContent = meta.label;

  const track = document.getElementById('bookTrack');
  track.innerHTML = `<div class="book-page"><div class="page-empty"><p>불러오는 중…</p></div></div>`;
  currentPages = [{ type: 'empty' }];
  totalPages = 1;
  currentPage = 0;
  goToPage(0, false);

  let pages = [{
    type: 'cover',
    subtitle: [meta.label, meta.note].filter(Boolean).join(' · '),
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

  currentPages = pages;
  totalPages = pages.length;
  currentPage = 0;
  track.innerHTML = pages.map((entry) =>
    `<div class="book-page">${buildPageContent(entry)}</div>`
  ).join('');
  bindDeleteButtons();
  goToPage(0, false);
}

function goToPage(index, animate = true) {
  if (index < 0 || index >= totalPages) return;
  currentPage = index;

  const track = document.getElementById('bookTrack');
  if (!animate) track.style.transition = 'none';
  track.style.transform = `translateX(-${currentPage * 100}%)`;
  if (!animate) {
    track.offsetHeight;
    track.style.transition = '';
  }

  document.getElementById('bookPageNum').textContent = `${currentPage + 1} / ${totalPages}`;
  document.getElementById('btnBookPrev').disabled = currentPage === 0;
  document.getElementById('btnBookNext').disabled = currentPage >= totalPages - 1;
}

async function openBookSelect() {
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

  shelf.innerHTML = DIARY_DATES.map((d) => {
    const count = counts[d.date] || 0;
    return `
      <button type="button" class="shelf-book" data-date="${d.date}">
        <span class="shelf-book-spine"></span>
        <span class="shelf-book-body">
          <span class="shelf-book-label">${d.label}</span>
          ${d.note ? `<span class="shelf-book-note">${d.note}</span>` : ''}
          <span class="shelf-book-count">${count}편의 일기</span>
        </span>
      </button>
    `;
  }).join('');

  shelf.querySelectorAll('.shelf-book').forEach((btn) => {
    btn.addEventListener('click', async () => {
      showScreen('read');
      await loadBook(btn.dataset.date);
    });
  });
}

document.getElementById('btnWrite').addEventListener('click', openWriteGate);
document.getElementById('btnRead').addEventListener('click', openBookSelect);
document.getElementById('btnBackPassword').addEventListener('click', () => showScreen('main'));
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
  openDateSelect();
});

document.querySelectorAll('.emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('inputSatisfaction').value = btn.dataset.emoji;
  });
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
viewport.addEventListener('click', (e) => {
  if (e.target.closest('.btn-delete')) return;
  const rect = viewport.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x > rect.width * 0.55) goToPage(currentPage + 1);
  else if (x < rect.width * 0.45) goToPage(currentPage - 1);
});

viewport.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

viewport.addEventListener('touchend', (e) => {
  if (e.target.closest('.btn-delete')) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 40) {
    if (dx < 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  }
}, { passive: true });

db = initSupabase();
