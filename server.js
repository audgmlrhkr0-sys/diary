const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'entries.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

const DIARY_DATES = [
  { date: '2026-08-10', label: '8월 10일', day: '월' },
  { date: '2026-08-22', label: '8월 22일', day: '토' },
  { date: '2026-08-29', label: '8월 29일', day: '토' },
  { date: '2026-09-05', label: '9월 5일', day: '토' },
  { date: '2026-09-12', label: '9월 12일', day: '토' },
  { date: '2026-09-19', label: '9월 19일', day: '토' },
];

function readEntries() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeEntries(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/dates', (_req, res) => {
  const entries = readEntries();
  const dates = DIARY_DATES.map((d) => ({
    ...d,
    count: (entries[d.date] || []).length,
  }));
  res.json(dates);
});

app.get('/api/entries', (_req, res) => {
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
  res.json(all);
});

app.get('/api/entries/:date', (req, res) => {
  const entries = readEntries();
  res.json(entries[req.params.date] || []);
});

app.post('/api/entries', (req, res) => {
  const { date, name, content, satisfaction } = req.body;

  if (!date || !name?.trim() || !content?.trim() || !satisfaction) {
    return res.status(400).json({ error: '모든 항목을 입력해 주세요.' });
  }

  const validDate = DIARY_DATES.find((d) => d.date === date);
  if (!validDate) {
    return res.status(400).json({ error: '유효하지 않은 날짜입니다.' });
  }

  const entries = readEntries();
  if (!entries[date]) entries[date] = [];

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    content: content.trim(),
    satisfaction,
    createdAt: new Date().toISOString(),
  };

  entries[date].push(entry);
  writeEntries(entries);

  res.json({ success: true, entry });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`감상평 다이어리 서버: http://localhost:${PORT}`);
  console.log(`같은 Wi-Fi에서 휴대폰 접속: http://<내 IP>:${PORT}`);
});
