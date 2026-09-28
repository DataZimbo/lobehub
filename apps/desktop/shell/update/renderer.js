const title = document.getElementById('title');
const description = document.getElementById('description');
const status = document.getElementById('status');
const amount = document.getElementById('amount');
const progress = document.getElementById('progress');
const actions = document.getElementById('actions');
const retry = document.getElementById('retry');
const quit = document.getElementById('quit');
let previousPhase;
window.updateWindow.onState((state) => {
  const t = state.strings;
  document.documentElement.lang = state.language;
  document.querySelector('main').setAttribute('aria-busy', String(state.phase !== 'error'));
  title.textContent =
    state.phase === 'error' ? t.error : state.reason === 'required' ? t.requiredTitle : t.title;
  description.textContent =
    state.phase === 'error'
      ? t.errorDescription
      : state.reason === 'required'
        ? t.requiredDescription
        : '';
  status.textContent = state.phase === 'error' ? '' : t[state.phase];
  amount.textContent = '';
  progress.removeAttribute('value');
  progress.setAttribute('aria-label', t[state.phase] || t.downloading);
  progress.hidden = state.phase === 'error';
  actions.hidden = state.phase !== 'error';
  retry.textContent = t.retry;
  quit.textContent = t.quit;
  if (state.phase === 'downloading') {
    const percent =
      state.percent ?? (state.total > 0 ? (state.received / state.total) * 100 : undefined);
    if (Number.isFinite(percent)) {
      progress.max = 100;
      progress.value = Math.max(0, Math.min(100, percent));
      amount.textContent = `${Math.floor(progress.value)}%`;
    } else if (state.received > 0) {
      amount.textContent = `${(state.received / 1024 / 1024).toFixed(1)} MB`;
    }
  }
  if (state.phase === 'error' && previousPhase !== 'error') retry.focus();
  previousPhase = state.phase;
});
retry.addEventListener('click', () => window.updateWindow.retry());
quit.addEventListener('click', () => window.updateWindow.quit());
