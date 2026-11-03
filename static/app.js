const $ = id => document.getElementById(id);
const quotes = [
  'You are allowed to grow slowly.', 'You do not have to bloom every day.',
  'Small steps are still steps forward.', 'Rest is a part of the journey, too.',
  'You deserve the kindness you give others.', 'One hard moment is not your whole story.',
  'You can begin again, as gently as you need.', 'You are a person, not a productivity machine.',
  'It is enough to do what you can today.', 'Let today be softer than yesterday.',
  'You can feel things without fixing them right away.', 'There is no deadline for becoming yourself.',
  'You are doing better than you give yourself credit for.', 'A little pause is a lovely place to start.'
];
let selectedMood = 'Okay';
let installPrompt = null;
let identityReady = false;
const audio = $('audio-player');
if (audio) { audio.loop = true; audio.volume = 0.55; }

async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
  } catch {
    throw new Error('Cannot reach the app server. Check your connection and try again.');
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}

const today = new Date();
const quoteIndex = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000) % quotes.length;
if ($('daily-quote')) $('daily-quote').textContent = quotes[quoteIndex];

function showTab(name) {
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== `tab-${name}`));
  if (name === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
document.querySelectorAll('.mood').forEach(button => button.addEventListener('click', () => {
  selectedMood = button.dataset.mood;
  document.querySelectorAll('.mood').forEach(mood => mood.classList.toggle('selected', mood === button));
}));
['stress', 'anxiety', 'energy'].forEach(id => $(id)?.addEventListener('input', () => {
  const output = $(`${id}-out`);
  if (output) output.textContent = `${$(id).value}/10`;
}));
$('start-journal')?.addEventListener('click', () => showTab('journal'));
$('back-checkin')?.addEventListener('click', () => showTab('checkin'));

$('save-entry')?.addEventListener('click', async () => {
  const button = $('save-entry');
  const message = $('save-message');
  if (!identityReady) {
    message.textContent = 'Your private browser journal is still connecting. Please try again in a moment.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Saving gently…';
  message.textContent = '';
  const entry = {
    mood: selectedMood,
    stress: Number($('stress').value),
    anxiety: Number($('anxiety').value),
    energy: Number($('energy').value),
    journal_text: $('journal-text').value.trim(),
    gratitude: $('gratitude').value.trim(),
    best_thing: $('best-thing').value.trim()
  };
  try {
    await apiJson('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    message.textContent = 'Saved privately in this browser ♡';
    $('journal-text').value = '';
    $('gratitude').value = '';
    $('best-thing').value = '';
    setTimeout(() => showTab('history'), 700);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save this moment ♡';
  }
});

async function loadHistory() {
  const container = $('history-list');
  if (!container || !identityReady) return;
  container.innerHTML = '<div class="empty-state panel"><span>🌷</span><p>Gathering your memories…</p></div>';
  try {
    const entries = await apiJson('/api/entries');
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state panel"><span>🌱</span><h3>Your memories will bloom here</h3><p>Save your first journal moment and come back whenever you need a gentle reset.</p></div>';
      return;
    }
    container.replaceChildren();
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
        const paragraph = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        paragraph.append(strong, document.createTextNode(entry[key]));
        card.append(paragraph);
      });
      container.append(card);
    });
  } catch (error) {
    container.replaceChildren();
    const status = document.createElement('p');
    status.className = 'status-message';
    status.textContent = error.message;
    container.append(status);
  }
}
function moodEmoji(mood) {
  return ({ Great: '☀️', Good: '🌼', Okay: '☁️', Low: '🌧️', Anxious: '🫧' })[mood] || '♡';
}
function formatDate(value) {
  if (!value) return 'A little moment';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
async function deleteEntry(id) {
  if (!confirm('Delete this memory? This cannot be undone.')) return;
  try {
    await apiJson(`/api/entries/${id}`, { method: 'DELETE' });
    loadHistory();
  } catch (error) { alert(error.message); }
}

const tracks = [...document.querySelectorAll('.track')];
function selectTrack(track, autoplay) {
  if (!track) return;
  tracks.forEach(item => item.classList.toggle('selected', item === track));
  const src = track.dataset.src;
  if (audio && !audio.src.endsWith(src)) audio.src = src;
  if ($('now-playing')) $('now-playing').textContent = track.dataset.title;
  if ($('music-caption')) $('music-caption').textContent = track.dataset.caption;
  if (autoplay && audio) audio.play().catch(() => {
    if ($('music-caption')) $('music-caption').textContent = 'Tap Play to start this sound on your device.';
  });
}
tracks.forEach(track => track.addEventListener('click', () => selectTrack(track, true)));
$('play-btn')?.addEventListener('click', () => {
  if (!audio) return;
  if (!audio.src || !tracks.some(track => audio.src.endsWith(track.dataset.src))) selectTrack(tracks[0], false);
  audio.play().catch(() => {
    if ($('music-caption')) $('music-caption').textContent = 'Tap Play to start this sound on your device.';
  });
});
$('pause-btn')?.addEventListener('click', () => audio?.pause());
$('stop-btn')?.addEventListener('click', () => { if (audio) { audio.pause(); audio.currentTime = 0; } });
$('volume')?.addEventListener('input', () => { if (audio) audio.volume = Number($('volume').value); });
let breathing = false;
$('breathing-btn')?.addEventListener('click', () => {
  breathing = !breathing;
  $('breathing-orb')?.classList.toggle('breathe', breathing);
  if ($('breathing-btn')) $('breathing-btn').textContent = breathing ? 'Stop breathing' : 'Start breathing';
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('install-btn')?.classList.remove('hidden');
});
$('install-btn')?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('install-btn').classList.add('hidden');
});

(async function initializePrivateBrowserJournal() {
  let status = $('identity-status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'identity-status';
    status.className = 'status-message';
    status.setAttribute('role', 'status');
    document.querySelector('.app-shell')?.prepend(status);
  }
  status.textContent = 'Preparing your private journal…';
  try {
    await apiJson('/api/identity');
    identityReady = true;
    status.remove();
    loadHistory();
  } catch (error) {
    status.textContent = `Your journal could not connect: ${error.message}. Please refresh to try again.`;
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
