const quotes = [
  'You are allowed to grow slowly.', 'You do not have to bloom every day.',
  'Small steps are still steps forward.', 'Rest is a part of the journey, too.',
  'You deserve the kindness you give others.', 'One hard moment is not your whole story.',
  'You can begin again, as gently as you need.', 'You are a person, not a productivity machine.',
  'It is enough to do what you can today.', 'Let today be softer than yesterday.',
  'You can feel things without fixing them right away.', 'There is no deadline for becoming yourself.',
  'You are doing better than you give yourself credit for.', 'A little pause is a lovely place to start.'
];
const $ = id => document.getElementById(id);
let signedInUser = null;
let selectedMood = 'Okay';
let authMode = 'login';
let installPrompt = null;
const audio = $('audio-player');
if (audio) { audio.loop = true; audio.volume = 0.55; }
const appShell = document.querySelector('.app-shell');
const topbar = document.querySelector('.topbar');

// Inline display styles otherwise override the browser's default [hidden] behavior.
const hiddenStyle = document.createElement('style');
hiddenStyle.textContent = '[hidden] { display: none !important; }';
document.head.append(hiddenStyle);

const authScreen = document.createElement('section');
authScreen.id = 'auth-screen';
authScreen.setAttribute('aria-label', 'Sign in to Little Pause');
authScreen.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#f8eff2;padding:20px;overflow:auto';
authScreen.innerHTML = `
  <div id="auth-card" class="panel" style="box-sizing:border-box;width:min(100%,420px);padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #50374725">
    <p class="eyebrow">A PRIVATE SPACE FOR YOU</p>
    <h1 id="auth-title">Welcome back</h1>
    <p id="auth-description" class="muted">Sign in to see your personal journal.</p>
    <form id="auth-form" novalidate>
      <label for="auth-username">Username</label>
      <input id="auth-username" name="username" autocomplete="username" minlength="3" maxlength="30" required>
      <label for="auth-password">Password</label>
      <input id="auth-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required>
      <p class="muted">Username: 3–30 letters, numbers, dots, dashes, or underscores. Password: 8–128 characters.</p>
      <p id="auth-error" class="status-message" aria-live="polite"></p>
      <button id="auth-submit" class="primary-btn" type="submit">Sign in</button>
      <button id="auth-switch" class="secondary-btn" type="button">Create account</button>
    </form>
  </div>
`;
authScreen.querySelectorAll('label').forEach(label => { label.style.display = 'block'; label.style.margin = '14px 0 6px'; });
authScreen.querySelectorAll('input').forEach(input => { input.style.cssText = 'box-sizing:border-box;width:100%;padding:12px;border:1px solid #d8cbd1;border-radius:10px;font:inherit'; });
document.body.prepend(authScreen);
if (appShell) appShell.hidden = true;
const accountBar = document.createElement('div');
accountBar.id = 'account-bar';
accountBar.hidden = true;
accountBar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:auto';
accountBar.innerHTML = '<span id="account-name"></span><button id="logout-button" class="secondary-btn" type="button">Sign out</button>';
topbar?.append(accountBar);

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

async function apiJson(url, options = {}) {
  let response;
  try { response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options }); }
  catch { throw new Error('Cannot reach the app server. Check your connection and try again.'); }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}

function showSignedIn(user) {
  signedInUser = user;
  authScreen.hidden = true;
  if (appShell) appShell.hidden = false;
  accountBar.hidden = false;
  $('account-name').textContent = `Signed in as ${user.username}`;
  const installButton = topbar?.querySelector('#install-btn');
  if (installButton) installButton.hidden = false;
  if (document.querySelector('.tab.active')?.dataset.tab === 'history') loadHistory();
}
function showSignedOut() {
  signedInUser = null;
  authScreen.hidden = false;
  if (appShell) appShell.hidden = true;
  accountBar.hidden = true;
}

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  const button = $('auth-submit');
  const errorBox = $('auth-error');
  errorBox.textContent = '';
  button.disabled = true;
  button.textContent = authMode === 'register' ? 'Creating account…' : 'Signing in…';
  try {
    const user = await apiJson(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    $('auth-password').value = '';
    showSignedIn(user);
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = authMode === 'register' ? 'Create account' : 'Sign in';
  }
});

$('logout-button').addEventListener('click', async () => {
  try { await apiJson('/api/auth/logout', { method: 'POST' }); }
  catch (error) { console.error('Sign-out request failed:', error); }
  showSignedOut();
});

async function restoreSession() {
  try { showSignedIn(await apiJson('/api/auth/me')); }
  catch { showSignedOut(); }
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
    await apiJson('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    message.textContent = 'Saved privately to your account ♡';
    $('journal-text').value = ''; $('gratitude').value = ''; $('best-thing').value = '';
    setTimeout(() => showTab('history'), 700);
  } catch (error) {
    message.textContent = error.message;
    if (error.message.includes('sign in') || error.message.includes('session expired')) showSignedOut();
  } finally {
    button.disabled = false;
    button.textContent = 'Save this moment ♡';
  }
});

async function loadHistory() {
  const container = $('history-list');
  if (!container || !signedInUser) return;
  container.innerHTML = '<div class="empty-state panel"><span>🌷</span><p>Gathering your memories…</p></div>';
  try {
    const entries = await apiJson('/api/entries');
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
    container.replaceChildren();
    const status = document.createElement('p'); status.className = 'status-message'; status.textContent = error.message; container.append(status);
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
  try { await apiJson(`/api/entries/${id}`, { method: 'DELETE' }); loadHistory(); }
  catch (error) { if (error.message.includes('sign in')) showSignedOut(); else alert(error.message); }
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
  audio.play().catch(() => { if ($('music-caption')) $('music-caption').textContent = 'Tap Play to start this sound on your device.'; });
});
$('pause-btn')?.addEventListener('click', () => audio?.pause());
$('stop-btn')?.addEventListener('click', () => { if (audio) { audio.pause(); audio.currentTime = 0; } });
$('volume')?.addEventListener('input', () => { if (audio) audio.volume = Number($('volume').value); });
let breathing = false;
$('breathing-btn')?.addEventListener('click', () => {
  breathing = !breathing;
  $('breathing-orb')?.classList.toggle('breathe', breathing);
  $('breathing-btn').textContent = breathing ? 'Stop breathing' : 'Start breathing';
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install-btn')?.classList.remove('hidden'); });
$('install-btn')?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('install-btn')?.classList.add('hidden');
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

restoreSession();
