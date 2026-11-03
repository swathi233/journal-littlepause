const quotes = [
  'You are allowed to grow slowly.',
  'You do not have to bloom every day.',
  'Small steps are still steps forward.',
  'Rest is a part of the journey, too.',
  'You deserve the kindness you give others.',
  'One hard moment is not your whole story.',
  'You can begin again, as gently as you need.',
  'You are a person, not a productivity machine.',
  'It is enough to do what you can today.',
  'Let today be softer than yesterday.',
  'You can feel things without fixing them right away.',
  'There is no deadline for becoming yourself.',
  'You are doing better than you give yourself credit for.',
  'A little pause is a lovely place to start.'
];

const $ = (id) => document.getElementById(id);
const USER_KEY = 'littlepause-user-name';
let selectedMood = 'Okay';
let installPrompt = null;
const audio = $('audio-player');
audio.loop = true;
audio.volume = 0.55;

function getCurrentUserName() {
  return (localStorage.getItem(USER_KEY) || '').trim() || 'friend';
}

// Add a small name field without requiring a separate account system.
// This keeps each browser profile's journal separated by the chosen name.
function ensureUserNameField() {
  const moodGrid = $('mood-grid');
  if (!moodGrid || $('user-name')) return;

  const panel = document.createElement('div');
  panel.className = 'panel form-panel';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = 'user-name';
  label.textContent = 'Who is this journal for?';
  const input = document.createElement('input');
  input.id = 'user-name';
  input.type = 'text';
  input.maxLength = 100;
  input.autocomplete = 'name';
  input.placeholder = 'Enter your name';
  input.value = localStorage.getItem(USER_KEY) || '';
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'Your history is grouped by this name on this device.';
  panel.append(label, input, note);
  moodGrid.closest('.form-panel').before(panel);

  input.addEventListener('change', () => {
    const name = input.value.trim();
    if (name) localStorage.setItem(USER_KEY, name);
    else localStorage.removeItem(USER_KEY);
  });
}

ensureUserNameField();

// Stable daily quote based on the local calendar date.
const today = new Date();
const dayIndex = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000) % quotes.length;
$('daily-quote').textContent = quotes[dayIndex];

function showTab(name) {
  document.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== `tab-${name}`));
  if (name === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

document.querySelectorAll('.mood').forEach(btn => btn.addEventListener('click', () => {
  selectedMood = btn.dataset.mood;
  document.querySelectorAll('.mood').forEach(m => m.classList.toggle('selected', m === btn));
}));
['stress', 'anxiety', 'energy'].forEach(id => $(id).addEventListener('input', () => { $(`${id}-out`).textContent = `${$(id).value}/10`; }));
$('start-journal').addEventListener('click', () => showTab('journal'));
$('back-checkin').addEventListener('click', () => showTab('checkin'));

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    throw new Error(`The server returned a non-JSON response (${response.status}). ${body.slice(0, 120)}`);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}

function showApiError(container, error) {
  container.replaceChildren();
  const message = document.createElement('p');
  message.className = 'status-message';
  message.textContent = error instanceof TypeError
    ? 'Could not reach the journal server. Check your connection, then reload the app. If this is a deployed app, make sure the latest backend deployment is running.'
    : error.message;
  container.append(message);
}

$('save-entry').addEventListener('click', async () => {
  const button = $('save-entry');
  const message = $('save-message');
  const userName = ($('user-name').value || '').trim() || 'friend';
  if (userName !== 'friend') localStorage.setItem(USER_KEY, userName);
  button.disabled = true;
  button.textContent = 'Saving gently…';
  message.textContent = '';
  const payload = {
    mood: selectedMood,
    stress: Number($('stress').value),
    anxiety: Number($('anxiety').value),
    energy: Number($('energy').value),
    journal_text: $('journal-text').value.trim(),
    gratitude: $('gratitude').value.trim(),
    best_thing: $('best-thing').value.trim(),
    user_name: userName
  };

  try {
    await readJsonResponse(await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    message.textContent = 'Saved with care. Thank you for checking in with yourself ♡';
    $('journal-text').value = '';
    $('gratitude').value = '';
    $('best-thing').value = '';
    setTimeout(() => showTab('history'), 850);
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? 'Could not reach the journal server. Check that the app backend is running and reload.'
      : error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save this moment ♡';
  }
});

async function loadHistory() {
  const container = $('history-list');
  const userName = ($('user-name').value || '').trim() || 'friend';
  container.innerHTML = '<div class="empty-state panel"><span>🌷</span><p>Gathering your memories…</p></div>';
  try {
    const url = `/api/entries?user_name=${encodeURIComponent(userName)}`;
    const entries = await readJsonResponse(await fetch(url, { cache: 'no-store' }));
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state panel"><span>🌱</span><h3>Your memories will bloom here</h3><p>Save your first journal moment and come back whenever you need a gentle reset.</p></div>';
      return;
    }

    container.innerHTML = '';
    entries.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'history-card panel';
      const top = document.createElement('div');
      top.className = 'history-top';
      const heading = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = `${moodEmoji(entry.mood)} ${entry.mood} day`;
      const date = document.createElement('p');
      date.className = 'history-date';
      date.textContent = formatDate(entry.created_at);
      heading.append(title, date);

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete this journal entry');
      del.addEventListener('click', () => deleteEntry(entry.id));
      top.append(heading, del);
      card.append(top);

      const meta = document.createElement('div');
      meta.className = 'history-meta';
      [`Stress ${entry.stress}/10`, `Anxiety ${entry.anxiety}/10`, `Energy ${entry.energy}/10`].forEach(text => {
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = text;
        meta.append(pill);
      });
      card.append(meta);

      [['journal_text', 'A thought I shared'], ['gratitude', 'Grateful for'], ['best_thing', 'A kind thing for me']].forEach(([key, label]) => {
        if (!entry[key]) return;
        const p = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        p.append(strong, document.createTextNode(entry[key]));
        card.append(p);
      });
      container.append(card);
    });
  } catch (error) {
    showApiError(container, error);
  }
}

function moodEmoji(mood) { return ({ Great: '☀️', Good: '🌼', Okay: '☁️', Low: '🌧️', Anxious: '🫧' })[mood] || '♡'; }
function formatDate(value) {
  if (!value) return 'A little moment';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function deleteEntry(id) {
  if (!confirm('Delete this memory? This cannot be undone.')) return;
  const userName = ($('user-name').value || '').trim() || 'friend';
  try {
    const url = `/api/entries/${id}?user_name=${encodeURIComponent(userName)}`;
    await readJsonResponse(await fetch(url, { method: 'DELETE' }));
    loadHistory();
  } catch (error) {
    const message = $('save-message');
    message.textContent = error instanceof TypeError
      ? 'Could not reach the journal server. Check your connection and try again.'
      : error.message;
  }
}

const tracks = [...document.querySelectorAll('.track')];
function selectTrack(track, autoplay) {
  tracks.forEach(item => item.classList.toggle('selected', item === track));
  const src = track.dataset.src;
  if (!audio.src.endsWith(src)) audio.src = src;
  $('now-playing').textContent = track.dataset.title;
  $('music-caption').textContent = track.dataset.caption;
  if (autoplay) audio.play().catch(() => { $('music-caption').textContent = 'Tap Play to start this sound on your device.'; });
}
tracks.forEach(track => track.addEventListener('click', () => selectTrack(track, true)));
$('play-btn').addEventListener('click', () => {
  if (!audio.src || !tracks.some(track => audio.src.endsWith(track.dataset.src))) selectTrack(tracks[0], false);
  audio.play().catch(() => { $('music-caption').textContent = 'Tap Play to start this sound on your device.'; });
});
$('pause-btn').addEventListener('click', () => audio.pause());
$('stop-btn').addEventListener('click', () => { audio.pause(); audio.currentTime = 0; });
$('volume').addEventListener('input', () => audio.volume = Number($('volume').value));

let breathing = false;
$('breathing-btn').addEventListener('click', () => {
  breathing = !breathing;
  $('breathing-orb').classList.toggle('breathe', breathing);
  $('breathing-btn').textContent = breathing ? 'Stop breathing' : 'Start breathing';
});

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install-btn').classList.remove('hidden'); });
$('install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('install-btn').classList.add('hidden');
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
