// Print sem gravação: o navegador pergunta a tela, esta janela se esconde, tira um quadro da tela inteira e abre
// salvar/seleção nela.

import { escolherMonitor, descobrirMonitor } from '../comum/monitores.js';
import { abrirMonitor, quadroDe } from '../comum/gravador.js';
import { guardarImagem } from '../comum/db.js';
import { abrirSalvar, abrirSelecao, esconderJanela } from '../comum/janelas.js';
import { esperar, notificar, fecharPagina } from '../comum/util.js';
import { iniciarInterface } from '../comum/interface.js';

iniciarInterface();
const busca = new URLSearchParams(location.search);
const modo = busca.get('modo') === 'selecao' ? 'selecao' : 'print';
const $ = id => document.getElementById(id);

let tela = null, voltar = async () => {};
try {
  const esc = await escolherMonitor(false);
  const w = await chrome.windows.getCurrent();
  await chrome.windows.update(w.id, { state: 'minimized' }); // some da tela antes da captura
  voltar = await esconderJanela(busca.get('esconder')); // a janela do painel também não pode sair no print
  tela = await abrirMonitor(esc, { fps: 30 });
  await esperar(500); // tempo da janela sumir e o vídeo ter quadros novos
  const t = tela.getVideoTracks()[0];
  const blob = await quadroDe(t);
  const m = await descobrirMonitor(t);
  tela.getTracks().forEach(x => x.stop());
  tela = null;
  const id = await guardarImagem(blob);
  await voltar(); voltar = async () => {}; // traz o painel de volta antes de abrir o salvar (que fica na frente)
  await (modo === 'selecao' ? abrirSelecao(id, m ? m.bounds : null) : abrirSalvar(id, m ? m.bounds : null));
} catch (e) {
  if (e.name !== 'NotAllowedError') {
    $('t').textContent = 'Não consegui tirar o print';
    $('s').textContent = e.message || String(e);
    notificar('Não consegui tirar o print: ' + (e.message || e));
  }
} finally {
  if (tela) tela.getTracks().forEach(x => x.stop());
  await voltar();
}
fecharPagina();
