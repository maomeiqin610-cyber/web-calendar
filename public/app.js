const API_BASE = window.API_BASE || '/api';

const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

const state = {
  current: new Date(),
  selected: new Date(),
  events: [],
  editingId: null,
};

const monthLabel = document.getElementById('monthLabel');
const selectedLabel = document.getElementById('selectedLabel');
const calendarGrid = document.getElementById('calendarGrid');
const weekdaysEl = document.getElementById('weekdays');
const eventList = document.getElementById('eventList');
const addEventBtn = document.getElementById('addEvent');
const dialog = document.getElementById('eventDialog');
const form = document.getElementById('eventForm');
const dialogTitle = document.getElementById('dialogTitle');
const deleteBtn = document.getElementById('deleteEvent');
const closeDialog = document.getElementById('closeDialog');

const [titleInput, dateInput, startInput, endInput, memoInput] =
  form.querySelectorAll('input, textarea');

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatSelectedLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 (${weekdays[date.getDay()]})`;
}

function toLocalDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTimeInput(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeRange(event) {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const startText = start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const endText = end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return `${startText} - ${endText}`;
}

function eventMapByDate(events) {
  const map = new Map();
  for (const event of events) {
    const dayKey = toDateKey(new Date(event.start_at));
    if (!map.has(dayKey)) {
      map.set(dayKey, []);
    }
    map.get(dayKey).push(event);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }
  return map;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(detail.error || 'API error');
  }

  return res.json();
}

async function loadEvents() {
  const year = state.current.getFullYear();
  const month = pad(state.current.getMonth() + 1);
  const data = await api(`/events?month=${year}-${month}`);
  state.events = data.events || [];
}

function renderWeekdays() {
  weekdaysEl.innerHTML = weekdays
    .map((day) => `<div>${day}</div>`)
    .join('');
}

function renderCalendar() {
  monthLabel.textContent = formatMonthLabel(state.current);
  selectedLabel.textContent = formatSelectedLabel(state.selected);

  const year = state.current.getFullYear();
  const month = state.current.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const map = eventMapByDate(state.events);
  calendarGrid.innerHTML = '';

  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + i);

    const dayKey = toDateKey(cellDate);
    const dayEvents = map.get(dayKey) || [];

    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    if (cellDate.getMonth() !== month) {
      dayEl.classList.add('muted');
    }
    if (toDateKey(cellDate) === toDateKey(state.selected)) {
      dayEl.classList.add('selected');
    }

    dayEl.innerHTML = `
      <div class="day-number">${cellDate.getDate()}</div>
      <div class="chips">
        ${dayEvents
          .slice(0, 3)
          .map((event) => `<div class="chip">${event.title}</div>`)
          .join('')}
        ${dayEvents.length > 3 ? `<div class="chip">+${dayEvents.length - 3}</div>` : ''}
      </div>
    `;

    dayEl.addEventListener('click', () => {
      state.selected = cellDate;
      renderCalendar();
      renderEventList();
    });

    calendarGrid.appendChild(dayEl);
  }
}

function renderEventList() {
  const selectedKey = toDateKey(state.selected);
  const events = state.events
    .filter((event) => toDateKey(new Date(event.start_at)) === selectedKey)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  if (events.length === 0) {
    eventList.innerHTML = '<p class="eyebrow">予定がありません</p>';
    return;
  }

  eventList.innerHTML = events
    .map(
      (event) => `
      <div class="event">
        <div class="event-title">${event.title}</div>
        <div class="event-time">${formatTimeRange(event)}</div>
        <div class="event-memo">${event.memo || ''}</div>
        <button class="ghost" data-id="${event.id}">編集</button>
      </div>
    `
    )
    .join('');

  eventList.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = state.events.find((event) => String(event.id) === button.dataset.id);
      if (target) {
        openDialog(target);
      }
    });
  });
}

function openDialog(event) {
  if (event) {
    state.editingId = event.id;
    dialogTitle.textContent = '予定を編集';
    deleteBtn.classList.remove('hidden');

    const startDate = new Date(event.start_at);
    const endDate = new Date(event.end_at);

    titleInput.value = event.title;
    dateInput.value = toLocalDateInput(startDate);
    startInput.value = toLocalTimeInput(startDate);
    endInput.value = toLocalTimeInput(endDate);
    memoInput.value = event.memo || '';
  } else {
    state.editingId = null;
    dialogTitle.textContent = '予定を追加';
    deleteBtn.classList.add('hidden');

    titleInput.value = '';
    dateInput.value = toLocalDateInput(state.selected);
    startInput.value = '09:00';
    endInput.value = '10:00';
    memoInput.value = '';
  }

  dialog.showModal();
}

async function handleSubmit(event) {
  event.preventDefault();

  const dateValue = dateInput.value;
  const startValue = startInput.value;
  const endValue = endInput.value;
  const start = new Date(`${dateValue}T${startValue}`);
  const end = new Date(`${dateValue}T${endValue}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    alert('日時が正しくありません');
    return;
  }

  if (end <= start) {
    alert('終了時刻は開始時刻より後にしてください');
    return;
  }

  const payload = {
    title: titleInput.value.trim(),
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    memo: memoInput.value.trim(),
  };

  if (!payload.title) {
    alert('タイトルを入力してください');
    return;
  }

  try {
    if (state.editingId) {
      await api(`/events/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    dialog.close();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

async function handleDelete() {
  if (!state.editingId) return;
  if (!confirm('この予定を削除しますか？')) return;

  try {
    await api(`/events/${state.editingId}`, { method: 'DELETE' });
    dialog.close();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

function setupNav() {
  document.getElementById('prevMonth').addEventListener('click', async () => {
    state.current = new Date(state.current.getFullYear(), state.current.getMonth() - 1, 1);
    state.selected = new Date(state.current);
    await refresh();
  });

  document.getElementById('nextMonth').addEventListener('click', async () => {
    state.current = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 1);
    state.selected = new Date(state.current);
    await refresh();
  });
}

async function refresh() {
  await loadEvents();
  renderCalendar();
  renderEventList();
}

addEventBtn.addEventListener('click', () => openDialog());
closeDialog.addEventListener('click', () => dialog.close());
form.addEventListener('submit', handleSubmit);
deleteBtn.addEventListener('click', handleDelete);

renderWeekdays();
setupNav();
refresh();
