// Background (service worker): recebe os atalhos e as ações do menu do ícone e chama a página certa.
// A gravação em si fica na página do painel, porque só uma página aberta pode capturar a tela.

import { abrirPainel, abrirTrim, abrirSalvar, abrirSelecao, abrirCapturar } from './comum/janelas.js';
import { limparImagensVelhas } from './comum/db.js';
import { notificar, esperar } from './comum/util.js';

/** Manda uma mensagem para o painel. Devolve a resposta, ou null se o painel não estiver aberto. */
function pedirAoPainel(msg) {
  return new Promise(ok => {
    chrome.runtime.sendMessage({ para: 'painel', ...msg }, r => {
      if (chrome.runtime.lastError) return ok(null);
      ok(r ?? null);
    });
  });
}

/** Print do monitor inteiro: o que está sendo gravado ou, sem gravação, o que a pessoa escolher na hora. */
async function tirarPrint(modo) {
  const r = await pedirAoPainel({ tipo: 'quadro' });
  if (r && r.id) return modo === 'print' ? abrirSalvar(r.id) : abrirSelecao(r.id);
  if (r && r.erro) return notificar('Não consegui tirar o print: ' + r.erro);
  return modo === 'print' ? abrirCapturar('print') : abrirSelecao(null); // a seleção pede a tela ela mesma
}

async function acao(nome) {
  if (nome === 'gravar') {
    // painel aberto: ele liga ou desliga sozinho. Fechado: abre já mostrando a escolha da tela.
    const r = await pedirAoPainel({ tipo: 'alternar' });
    if (!r) return abrirPainel(true);
    if (r.erro) notificar(r.erro);
    return;
  }
  if (nome === 'clipe') {
    const r = await pedirAoPainel({ tipo: 'clipe' });
    if (!r) return notificar('A gravação está parada. Abra o Clipper e comece a gravar (ou use o atalho de gravar).');
    if (r.erro) return notificar(r.erro);
    return abrirTrim(r.id);
  }
  if (nome === 'print' || nome === 'selecao') return tirarPrint(nome);
  if (nome === 'trim') return abrirTrim();
  if (nome === 'painel') return abrirPainel();
}

const rodar = nome => acao(nome).catch(e => notificar('Erro: ' + (e.message || e)));

chrome.commands.onCommand.addListener(rodar);

// ações pedidas pelo menu do ícone (popup)
chrome.runtime.onMessage.addListener((m, _remetente, responder) => {
  if (m.para !== 'fundo' || m.tipo !== 'acao') return;
  (async () => {
    if (m.atraso) await esperar(m.atraso); // espera o menu fechar, senão ele aparece no print
    await rodar(m.acao);
    responder({ ok: true });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(d => {
  if (d.reason === 'install') abrirPainel();
  limparImagensVelhas().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => limparImagensVelhas().catch(() => {}));
