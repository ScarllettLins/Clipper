// Abre (ou traz para a frente) as páginas da extensão.
//   painel   aba normal: é onde a gravação acontece, então fica fixada enquanto grava
//   trim     janela própria
//   salvar   janela pequena, como uma caixa de diálogo
//   selecao  janela em tela cheia, por cima de tudo
// Salvar e seleção abrem no monitor que está sendo gravado (quando o Clipper sabe qual é).

import { monitorGravado } from './monitores.js';

const url = (pagina, busca = '') => chrome.runtime.getURL('paginas/' + pagina) + busca;

export async function acharPagina(pagina) {
  const base = url(pagina);
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
  return ctx.find(c => c.documentUrl && c.documentUrl.split('?')[0] === base) || null;
}

async function focar(c) {
  await chrome.tabs.update(c.tabId, { active: true });
  await chrome.windows.update(c.windowId, { focused: true });
}

/** gravar=true: o painel abre e já mostra a escolha da tela (usado pelo atalho de gravar). */
export async function abrirPainel(gravar = false) {
  const c = await acharPagina('painel.html');
  if (c) return focar(c);
  await chrome.tabs.create({ url: url('painel.html', gravar ? '?gravar=1' : '') });
}

/** Minimiza a janela (para ela não sair no print). Devolve uma função que a traz de volta como estava. */
export async function esconderJanela(id) {
  const w = id ? await chrome.windows.get(Number(id)).catch(() => null) : null;
  if (!w || w.state === 'minimized') return async () => {};
  await chrome.windows.update(w.id, { state: 'minimized' }).catch(() => {});
  return () => chrome.windows.update(w.id, { state: w.state }).catch(() => {});
}

export async function abrirTrim(sel) {
  const c = await acharPagina('trim.html');
  if (c) {
    await focar(c);
    chrome.runtime.sendMessage({ para: 'trim', tipo: 'atualizar', sel: sel || null }).catch(() => {});
    return;
  }
  await chrome.windows.create({
    url: url('trim.html', sel ? '?sel=' + sel : ''), type: 'popup', width: 1240, height: 800, focused: true,
  });
}

/** Centraliza uma janela de largura×altura no monitor m (bounds). Sem monitor, deixa o navegador decidir. */
const centro = (m, largura, altura) => m
  ? { left: Math.round(m.left + (m.width - largura) / 2), top: Math.round(m.top + (m.height - altura) / 2) } : {};

// "mon" é o monitor do print (bounds). Sem ele, usa o monitor que está sendo gravado.

export async function abrirSalvar(id, mon) {
  const m = mon !== undefined ? mon : await monitorGravado();
  await chrome.windows.create({ url: url('salvar.html', '?id=' + id), type: 'popup', width: 720, height: 720, focused: true, ...centro(m, 720, 720) });
}

// "esconder": id de uma janela que também some durante a captura (a do painel, quando o print sai de lá).

/** Print sem gravação: abre a página que pede o monitor, tira um quadro dele e segue para salvar ou seleção. */
export async function abrirCapturar(modo, esconder) {
  const w = await chrome.windows.getLastFocused().catch(() => null);
  const m = w && w.left !== undefined ? { left: w.left, top: w.top, width: w.width, height: w.height } : null;
  const busca = '?modo=' + modo + (esconder ? '&esconder=' + esconder : '');
  await chrome.windows.create({ url: url('capturar.html', busca), type: 'popup', width: 760, height: 640, focused: true, ...centro(m, 760, 640) });
}

/** Ferramenta de seleção em tela cheia. Sem id, ela mesma pede a tela e tira o print (sem janela no meio). */
export async function abrirSelecao(id, mon, esconder) {
  const u = url('selecao.html', id ? '?id=' + id : '?capturar=1' + (esconder ? '&esconder=' + esconder : ''));
  let m = mon !== undefined ? mon : await monitorGravado();
  if (!m && !id) { // abre no monitor onde a pessoa está
    const w = await chrome.windows.getLastFocused().catch(() => null);
    if (w && w.left !== undefined) m = { left: w.left + 8, top: w.top + 8, width: Math.max(400, w.width - 16), height: Math.max(300, w.height - 16) };
  }
  if (m) { // abre no monitor gravado e depois vai para tela cheia (tela cheia sempre fica no monitor da janela)
    try {
      const w = await chrome.windows.create({ url: u, type: 'popup', left: m.left, top: m.top, width: m.width, height: m.height, focused: true });
      await chrome.windows.update(w.id, { state: 'fullscreen' }).catch(() => {});
      return;
    } catch (e) { /* segue para o jeito padrão */ }
  }
  try {
    await chrome.windows.create({ url: u, type: 'popup', state: 'fullscreen', focused: true });
  } catch (e) {
    await chrome.windows.create({ url: u, type: 'popup', state: 'maximized', focused: true });
  }
}
