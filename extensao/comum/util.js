// Utilitários gerais (servem para as páginas e para o background).

export const esperar = ms => new Promise(r => setTimeout(r, ms));

export const uid = () => crypto.randomUUID().replace(/-/g, '');

const p2 = n => String(n).padStart(2, '0');

/** 2026-11-17_14-05-09 */
export function stamp(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
}

/** 17/11 14:05:09 */
export function dataCurta(d = new Date()) {
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** Nome digitado → nome de arquivo válido no Windows, sempre com a extensão ext. */
export function nomeArquivo(nome, ext, padrao) {
  let n = String(nome || '').replace(/[/\\|]/g, '-').replace(/[<>:"?*\x00-\x1f]/g, '').trim().replace(/[. ]+$/, '');
  const e = '.' + ext;
  if (n.toLowerCase().endsWith(e)) n = n.slice(0, -e.length).replace(/[ .]+$/, '');
  return (n || padrao || `arquivo_${stamp()}`) + e;
}

/** Pasta dentro de Downloads (ex.: "Clipper" ou "Trabalho/Clipper"), sem caracteres proibidos. */
export function pastaSegura(pasta) {
  const partes = String(pasta || '').split(/[/\\]+/)
    .map(p => p.replace(/[<>:"|?*\x00-\x1f]/g, '').trim().replace(/[. ]+$/, ''))
    .filter(p => p && p !== '..' && p !== '.');
  return partes.join('/') || 'Clipper';
}

export function notificar(msg) {
  try {
    chrome.notifications.create({
      type: 'basic', title: 'Clipper', message: String(msg).slice(0, 300),
      iconUrl: chrome.runtime.getURL('icones/clipper-128.png'),
    });
  } catch (e) { console.warn(e); }
}

/** Espera o download terminar. Rejeita se ele for interrompido ou cancelado. */
function esperarDownload(id) {
  return new Promise((ok, falha) => {
    const limite = setTimeout(() => fim(ok), 10 * 60_000); // "perguntar onde salvar" pode demorar: espera bastante
    function fim(f, x) { clearTimeout(limite); chrome.downloads.onChanged.removeListener(mudou); f(x); }
    function ver(estado, erro) {
      if (estado === 'complete') fim(ok);
      else if (estado === 'interrupted') fim(falha, new Error(erro === 'USER_CANCELED' ? 'Download cancelado.' : 'O download falhou' + (erro ? ` (${erro}).` : '.')));
    }
    function mudou(d) { if (d.id === id && d.state) ver(d.state.current, d.error && d.error.current); }
    chrome.downloads.onChanged.addListener(mudou);
    chrome.downloads.search({ id }).then(([d]) => { if (d) ver(d.state, d.error); }).catch(() => {});
  });
}

/**
 * Baixa o blob para Downloads/<caminho> e espera terminar (o blob URL só pode ser liberado depois disso).
 * Não usa data URL: o Chrome recusa URLs com mais de 2 MB, e um print de tela grande passa disso. Devolve o id.
 */
export async function baixarBlob(blob, caminho) {
  const u = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url: u, filename: caminho, conflictAction: 'uniquify' });
    if (id == null) throw new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'O navegador não começou o download.');
    await esperarDownload(id);
    return id;
  } finally {
    URL.revokeObjectURL(u);
  }
}

/** Fecha a aba/janela da própria página (window.close() nem sempre funciona em páginas da extensão). */
export async function fecharPagina() {
  try {
    const t = await chrome.tabs.getCurrent();
    if (t) return void chrome.tabs.remove(t.id);
  } catch (e) { /* segue para window.close */ }
  window.close();
}

/** Página do navegador onde se trocam os atalhos da extensão. */
export function paginaAtalhos() {
  return /\bEdg\//.test(navigator.userAgent) ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
}
