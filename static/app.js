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
let currentUser = null;
let selectedMood = 'Okay';
let installPrompt = null;
const audio = $('audio-player');
if (audio) { audio.loop = true; audio.volume = 0.55; }

const appShell = document.querySelector('.app-shell');
const topbar = document.querySelector('.topbar');
const auth = document.createElement('section');
auth.id = 'auth-screen';
auth.innerHTML = `<div class="auth-card"><p class="eyebrow">A PRIVATE SPACE FOR YOU</p><h1 id="auth-title">Welcome back</h1><p id="auth-description">Sign in to see your personal journal.</p><form id="auth-form"><label for="auth-username">Username</label><input id="auth-username" autocomplete="username" minlength="3" maxlength="30" required><label for="auth-password">Password</label><input id="auth-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required><p id="auth-error" role="alert" aria-live="polite"></p><div class="auth-actions"><button id="auth-submit" type="submit">Sign in</button><button id="auth-switch" type="button">Create account</button></div></form></div>`;
auth.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#f8eff2;padding:20px;overflow:auto';
const authCard = auth.querySelector('.auth-card');
authCard.style.cssText = 'box-sizing:border-box;width:min(100%,420px);padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #50374725';
authCard.querySelectorAll('label').forEach(el => { el.style.display = 'block'; el.style.margin = '14px 0 6px'; });
authCard.querySelectorAll('input').forEach(el => { el.style.cssText = 'box-sizing:border-box;width:100%;padding:12px;border:1px solid #d8cbd1;border-radius:10px;font:inherit'; });
authCard.querySelector('.auth-actions').style.cssText = 'display:flex;gap:10px;margin-top:16px';
authCard.querySelector('#auth-error').style.cssText = 'min-height:1.4em;color:#a52e4c';
document.body.prepend(auth);
if (appShell) appShell.hidden = true;
const accountBar = document.createElement('div');
accountBar.hidden = true;
accountBar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:auto';
accountBar.innerHTML = '<span id="account-name"></span><button id="logout-button" type="button">Sign out</button>';
topbar?.append(accountBar);

let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  $('auth-title').textContent = registering ? 'Create your private journal' : 'Welcome back';
  $('auth-description').textContent = registering ? 'Choose a username and password. Your journal is private to this account.' : 'Sign in to see your personal journal.';
  $('auth-submit').textContent = registering ? 'Create account' : 'Sign in';
  $('auth-switch').textContent = registering ? 'I already have an account' : 'Create account';
  $('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
}
$('auth-switch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));

async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options }); }
  catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const type = response.headers.get('content-type') || '';
  const result = type.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(result.detail || `Request failed (${response.status}).`);
  return result;
}
function showSignedIn(user) {
  currentUser = user;
  auth.hidden = true;
  if (appShell) appShell.hidden = false;
  accountBar.hidden = false;
  accountBar.querySelector('#account-name').textContent = `Signed in as ${user.username}`;
  const install = topbar?.querySelector('#install-btn');
  if (install) install.hidden = false;
  if (document.querySelector('.tab.active')?.dataset.tab === 'history') loadHistory();
}
function showSignedOut() {
  currentUser = null;
  auth.hidden = false;
  if (appShell) appShell.hidden = true;
  accountBar.hidden = true;
  setAuthMode('login');
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('auth-submit');
  const errorBox = $('auth-error');
  button.disabled = true;
  errorBox.textContent = '';
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  try {
    const user = await api(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    // Keep credentials visible if authentication fails; clear only after success.
    $('auth-password').value = '';
    showSignedIn(user);
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$('logout-button').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (error) { console.warn(error); }
  showSignedOut();
});
(async function restoreSession() {
  try { showSignedIn(await api('/api/auth/me')); }
  catch { showSignedOut(); }
})();

const dateNow = new Date();
const quoteIndex = Math.floor(Date.UTC(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate()) / 86400000) % quotes.length;
if ($('daily-quote')) $('daily-quote').textContent = quotes[quoteIndex];
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
['stress', 'anxiety', 'energy'].forEach(id => $(id)?.addEventListener('input', () => { $(`${id}-out`).textContent = `${$(id).value}/10`; }));
$('start-journal')?.addEventListener('click', () => showTab('journal'));
$('back-checkin')?.addEventListener('click', () => showTab('checkin'));

$('save-entry')?.addEventListener('click', async () => {
  const button = $('save-entry');
  const message = $('save-message');
  button.disabled = true;
  button.textContent = 'Saving gently…';
  message.textContent = '';
  const entry = {
    mood: selectedMood, stress: Number($('stress').value), anxiety: Number($('anxiety').value), energy: Number($('energy').value),
    journal_text: $('journal-text').value.trim(), gratitude: $('gratitude').value.trim(), best_thing: $('best-thing').value.trim()
  };
  try {
    await api('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    message.textContent = 'Saved privately to your account ♡';
    $('journal-text').value = ''; $('gratitude').value = ''; $('best-thing').value = '';
    setTimeout(() => showTab('history'), 700);
  } catch (error) {
    message.textContent = error.message;
    if (error.message.includes('sign in') || error.message.includes('session expired')) showSignedOut();
  } finally { button.disabled = false; button.innerHTML = 'Save this moment ♡'; }
});

async function loadHistory() {
  const container = $('history-list');
  if (!container || !currentUser) return;
  container.innerHTML = '<div class="empty-state panel"><span>🌷</span><p>Gathering your memories…</p></div>';
  try {
    const entries = await api('/api/entries');
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state panel"><span>🌱</span><h3>Your memories will bloom here</h3><p>Save your first journal moment and come back whenever you need a gentle reset.</p></div>';
      return;
    }
    container.replaceChildren();
    entries.forEach(entry => {
      const card = document.createElement('article'); card.className = 'history-card panel';
      const top = document.createElement('div'); top.className = 'history-top';
      const heading = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = `${moodEmoji(entry.mood)} ${entry.mood} day`;
      const date = document.createElement('p'); date.className = 'history-date'; date.textContent = formatDate(entry.created_at);
      heading.append(title, date);
      const del = document.createElement('button'); del.className = 'delete-btn'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete this journal entry'); del.addEventListener('click', () => deleteEntry(entry.id));
      top.append(heading, del); card.append(top);
      const meta = document.createElement('div'); meta.className = 'history-meta';
      [`Stress ${entry.stress}/10`, `Anxiety ${entry.anxiety}/10`, `Energy ${entry.energy}/10`].forEach(text => {
        const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = text; meta.append(pill);
      });
      card.append(meta);
      [['journal_text', 'A thought I shared'], ['gratitude', 'Grateful for'], ['best_thing', 'A kind thing for me']].forEach(([key, label]) => {
        if (!entry[key]) return;
        const p = document.createElement('p'); const strong = document.createElement('strong');
        strong.textContent = `${label}: `; p.append(strong, document.createTextNode(entry[key])); card.append(p);
      });
      container.append(card);
    });
  } catch (error) {
    if (error.message.includes('sign in') || error.message.includes('session expired')) showSignedOut();
    container.replaceChildren(); const p = document.createElement('p'); p.className = 'status-message'; p.textContent = error.message; container.append(p);
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
  try { await api(`/api/entries/${id}`, { method: 'DELETE' }); loadHistory(); }
  catch (error) { if (error.message.includes('sign in')) showSignedOut(); else alert(error.message); }
}

const tracks = [...document.querySelectorAll('.track')];
function selectTrack(track, autoplay) {
  tracks.forEach(item => item.classList.toggle('selected', item === track));
  const src = track.dataset.src;
  if (audio && !audio.src.endsWith(src)) audio.src = src;
  $('now-playing').textContent = track.dataset.title;
  $('music-caption').textContent = track.dataset.caption;
  if (autoplay && audio) audio.play().catch(() => { $('music-caption').textContent = 'Tap Play to start this sound on your device.'; });
}
tracks.forEach(track => track.addEventListener('click', () => selectTrack(track, true)));
$('play-btn')?.addEventListener('click', () => {
  if (!audio.src || !tracks.some(track => audio.src.endsWith(track.dataset.src))) selectTrack(tracks[0], false);
  audio.play().catch(() => { $('music-caption').textContent = 'Tap Play to start this sound on your device.'; });
});
$('pause-btn')?.addEventListener('click', () => audio?.pause());
$('stop-btn')?.addEventListener('click', () => { if (audio) { audio.pause(); audio.currentTime = 0; } });
$('volume')?.addEventListener('input', () => { if (audio) audio.volume = Number($('volume').value); });
let breathing = false;
$('breathing-btn')?.addEventListener('click', () => {
  breathing = !breathing;
  $('breathing-orb').classList.toggle('breathe', breathing);
  $('breathing-btn').textContent = breathing ? 'Stop breathing' : 'Start breathing';
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install-btn')?.classList.remove('hidden'); });
$('install-btn')?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('install-btn').classList.add('hidden');
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
