const DIARY_DATES = [
  { date: '2026-08-10', label: '8월 10일', day: '월' },
  { date: '2026-08-22', label: '8월 22일', day: '토' },
  { date: '2026-08-29', label: '8월 29일', day: '토' },
  { date: '2026-09-05', label: '9월 5일', day: '토' },
  { date: '2026-09-12', label: '9월 12일', day: '토' },
  { date: '2026-09-19', label: '9월 19일', day: '토' },
];

const STORAGE_KEY = 'diary-entries';

const screens = {
  main: document.getElementById('mainView'),
  date: document.getElementById('dateView'),
  write: document.getElementById('writeView'),
  read: document.getElementById('readView'),
};

let currentDate = null;
let currentPage = 0;
let totalPages = 0;
let touchStartX = 0;

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].classList.toggle('hidden', key !== name);
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function formatDateLabel(dateStr, day) {
  const [, m, d] = dateStr.split('-');
  return `2026년 ${parseInt(m)}월 ${parseInt(d)}일 (${day})`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function readEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveEntry(data) {
  const entries = readEntries();
  if (!entries[data.date]) entries[data.date] = [];

  const entry = {
    id: Date.now().toString(36),
    name: data.name,
    content: data.content,
    satisfaction: data.satisfaction,
    createdAt: new Date().toISOString(),
  };

  entries[data.date].push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entry;
}

function getAllEntries() {
  const entries = readEntries();
  const all = [];
  for (const d of DIARY_DATES) {
    for (const e of entries[d.date] || []) {
      all.push({ ...e, date: d.date, dateLabel: d.label, day: d.day });
    }
  }
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return all;
}

function openDateSelect() {
  const list = document.getElementById('datePickerList');
  list.innerHTML = DIARY_DATES.map((d) => `
    <button type="button" class="date-pick-btn" data-date="${d.date}">
      <span>${d.label}</span>
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
  document.getElementById('writeDateLabel').textContent = formatDateLabel(date, info.day);

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
      <p class="page-cover-title">감상평 다이어리</p>
      <p class="page-cover-sub">좌우로 넘겨 읽어보세요</p>
    </div>`;
  }
  if (entry.type === 'empty') {
    return `<div class="page-empty">
      <div class="page-empty-icon">📖</div>
      <p>아직 작성된 일기가 없어요<br>일기 쓰기에서 첫 일기를 남겨보세요</p>
    </div>`;
  }
  return `<div class="page-date-tag">${entry.dateLabel} · ${entry.day}요일</div>
    <div class="page-author">${escapeHtml(entry.name)}</div>
    <div class="page-emoji">${entry.satisfaction}</div>
    <div class="page-body">${escapeHtml(entry.content)}</div>`;
}

function loadBook() {
  const allEntries = getAllEntries();
  const pages = [{ type: 'cover' }];
  if (allEntries.length === 0) {
    pages.push({ type: 'empty' });
  } else {
    allEntries.forEach((e) => pages.push(e));
  }

  totalPages = pages.length;
  currentPage = 0;

  const track = document.getElementById('bookTrack');
  track.innerHTML = pages.map((entry) =>
    `<div class="book-page">${buildPageContent(entry)}</div>`
  ).join('');

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

function openRead() {
  showScreen('read');
  loadBook();
}

document.getElementById('btnWrite').addEventListener('click', openDateSelect);
document.getElementById('btnRead').addEventListener('click', openRead);
document.getElementById('btnBackDate').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackWrite').addEventListener('click', () => showScreen('main'));
document.getElementById('btnBackRead').addEventListener('click', () => showScreen('main'));

document.querySelectorAll('.emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('inputSatisfaction').value = btn.dataset.emoji;
  });
});

document.getElementById('diaryForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const name = document.getElementById('inputName').value.trim();
  const content = document.getElementById('inputContent').value.trim();
  const satisfaction = document.getElementById('inputSatisfaction').value;

  if (!name || !content || !satisfaction) {
    showToast('모든 항목을 입력해 주세요');
    return;
  }

  saveEntry({ date: currentDate, name, content, satisfaction });
  showToast('제출되었습니다');
  showScreen('main');
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
  const rect = viewport.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x > rect.width * 0.55) goToPage(currentPage + 1);
  else if (x < rect.width * 0.45) goToPage(currentPage - 1);
});

viewport.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

viewport.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 40) {
    if (dx < 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  }
}, { passive: true });
