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
let selectedMood = 'Okay';
let installPrompt = null;
const audio = $('audio-player');
audio.loop = true;
audio.volume = 0.55;

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
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.');
  return data;
}
$('save-entry').addEventListener('click', async () => {
  const button = $('save-entry');
  const message = $('save-message');
  button.disabled = true; button.textContent = 'Saving gently…'; message.textContent = '';
  const payload = { mood: selectedMood, stress: Number($('stress').value), anxiety: Number($('anxiety').value), energy: Number($('energy').value), journal_text: $('journal-text').value.trim(), gratitude: $('gratitude').value.trim(), best_thing: $('best-thing').value.trim() };
  try {
    await readJsonResponse(await fetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    message.textContent = 'Saved with care. Thank you for checking in with yourself ♡';
    $('journal-text').value = ''; $('gratitude').value = ''; $('best-thing').value = '';
    setTimeout(() => showTab('history'), 850);
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; button.innerHTML = 'Save this moment ♡'; }
});

async function loadHistory() {
  const container = $('history-list');
  container.innerHTML = '<div class="empty-state panel"><span>🌷</span><p>Gathering your memories…</p></div>';
  try {
    const entries = await readJsonResponse(await fetch('/api/entries'));
    if (!entries.length) { container.innerHTML = '<div class="empty-state panel"><span>🌱</span><h3>Your memories will bloom here</h3><p>Save your first journal moment and come back whenever you need to.</p></div>'; return; }
    container.innerHTML = '';
    entries.forEach(entry => {
      const card = document.createElement('article'); card.className = 'history-card panel';
      const top = document.createElement('div'); top.className = 'history-top';
      const heading = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = `${moodEmoji(entry.mood)} ${entry.mood} day`;
      const date = document.createElement('p'); date.className = 'history-date'; date.textContent = formatDate(entry.created_at);
      heading.append(title, date);
      const del = document.createElement('button'); del.className = 'delete-btn'; del.textContent = 'Delete'; del.setAttribute('aria-label', 'Delete this journal entry'); del.addEventListener('click', () => deleteEntry(entry.id));
      top.append(heading, del); card.append(top);
      const meta = document.createElement('div'); meta.className = 'history-meta';
      [`Stress ${entry.stress}/10`, `Anxiety ${entry.anxiety}/10`, `Energy ${entry.energy}/10`].forEach(text => { const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = text; meta.append(pill); }); card.append(meta);
      [['journal_text','A thought I shared'],['gratitude','Grateful for'],['best_thing','A kind thing for me']].forEach(([key,label]) => { if(entry[key]) { const p = document.createElement('p'); p.className = 'history-body'; const strong = document.createElement('strong'); strong.textContent = `${label}: `; p.append(strong, document.createTextNode(entry[key])); card.append(p); } });
      container.append(card);
    });
  } catch (error) { container.innerHTML = ''; const p = document.createElement('p'); p.className='status-message'; p.textContent = error.message; container.append(p); }
}
function moodEmoji(mood) { return ({Great:'☀️',Good:'🌼',Okay:'☁️',Low:'🌧️',Anxious:'🫧'})[mood] || '♡'; }
function formatDate(value) { if(!value) return 'A little moment'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }
async function deleteEntry(id) { if(!confirm('Delete this memory? This cannot be undone.')) return; try { await readJsonResponse(await fetch(`/api/entries/${id}`, {method:'DELETE'})); loadHistory(); } catch(error) { alert(error.message); } }

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
$('play-btn').addEventListener('click', () => { if(!audio.src || !tracks.some(t => audio.src.endsWith(t.dataset.src))) selectTrack(tracks[0], false); audio.play().catch(() => $('music-caption').textContent = 'Your device blocked playback. Tap Play once more.'); });
$('pause-btn').addEventListener('click', () => audio.pause());
$('stop-btn').addEventListener('click', () => { audio.pause(); audio.currentTime = 0; });
$('volume').addEventListener('input', () => audio.volume = Number($('volume').value));

let breathing = false;
$('breathing-btn').addEventListener('click', () => { breathing = !breathing; $('breathing-orb').classList.toggle('breathe', breathing); $('breathing-btn').textContent = breathing ? 'Stop breathing exercise' : 'Start breathing'; $('breathing-orb').querySelector('span').textContent = breathing ? 'Breathe' : '♡'; });

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install-btn').classList.remove('hidden'); });
$('install-btn').addEventListener('click', async () => { if(!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('install-btn').classList.add('hidden'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
