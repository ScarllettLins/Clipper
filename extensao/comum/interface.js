// Comum a todas as páginas: tema claro/escuro, aviso rápido (toast), links externos e registro de erros.

export const ICO = {
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  lua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
};

const CHAVE_TEMA = 'clipper-tema';

export function setTema(t, salvar = false) {
  document.documentElement.dataset.theme = t;
  const b = document.getElementById('btnTema');
  if (b) {
    b.innerHTML = t === 'dark' ? ICO.sol + ' Claro' : ICO.lua + ' Escuro';
    b.title = t === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro';
  }
  if (salvar) try { localStorage.setItem(CHAVE_TEMA, t); } catch (e) { /* sem armazenamento */ }
}

let toastT;
export function toast(msg, acao, fn) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = msg;
  t.append(s);
  if (acao) {
    const a = document.createElement('a');
    a.textContent = acao;
    a.onclick = fn;
    t.append(a);
  }
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 5000);
}

export const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Liga tema, links e registro de erros. Chame no começo de cada página. */
export function iniciarInterface() {
  setTema(document.documentElement.dataset.theme || 'light');
  const b = document.getElementById('btnTema');
  if (b) b.onclick = () => setTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  // outra página da extensão trocou o tema: acompanha
  addEventListener('storage', e => { if (e.key === CHAVE_TEMA && e.newValue) setTema(e.newValue); });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-url]');
    if (a) { e.preventDefault(); chrome.tabs.create({ url: a.dataset.url }); }
  });
  // os últimos erros ficam no chrome.storage.local (chave "erros"), para dar para investigar depois
  const registrar = m => chrome.storage.local.get({ erros: [] }).then(({ erros }) => {
    erros.push(`${new Date().toISOString()} ${location.pathname}: ${String(m).slice(0, 1000)}`);
    return chrome.storage.local.set({ erros: erros.slice(-50) });
  }).catch(() => {});
  addEventListener('error', e => registrar((e.message || 'erro') + ' @' + (e.lineno || '?') + ':' + (e.colno || '?')));
  addEventListener('unhandledrejection', e => { const r = e.reason; registrar('promise: ' + ((r && (r.message || r.name)) || r)); });
}
