// Painel: botão de gravar, ações rápidas e configurações. A gravação acontece nesta página.

import { lerConfig, salvarConfig } from '../comum/config.js';
import { Gravador } from '../comum/gravador.js';
import { dbPut, dbContar, guardarImagem, limparImagensVelhas } from '../comum/db.js';
import { abrirTrim, abrirSalvar, abrirSelecao, abrirCapturar } from '../comum/janelas.js';
import { toast, iniciarInterface, escH } from '../comum/interface.js';
import { esperar, notificar, uid, dataCurta, paginaAtalhos, pastaSegura } from '../comum/util.js';
import { descobrirMonitor, guardarMonitorGravado, listarMonitores } from '../comum/monitores.js';

iniciarInterface();
const $ = id => document.getElementById(id);
const F = ['buffer', 'fps', 'qualidade', 'audio', 'pasta'];
const grav = new Gravador();
let cfg = await lerConfig();
let atalhos = {};

// ---------------- configurações ----------------

function preencher() {
  F.forEach(k => { $(k).value = cfg[k]; });
  $('pastaEx').textContent = pastaSegura(cfg.pasta);
}
function dirty() { $('save').disabled = false; $('msg').textContent = 'Alterações não salvas'; }
F.forEach(k => $(k).addEventListener('input', dirty));
$('pasta').addEventListener('input', () => { $('pastaEx').textContent = pastaSegura($('pasta').value); });

$('save').onclick = async () => {
  const c = {};
  F.forEach(k => { c[k] = $(k).value; });
  c.buffer = Math.max(5, Math.min(600, parseInt(c.buffer, 10) || 60));
  c.fps = parseInt(c.fps, 10) || 30;
  c.pasta = pastaSegura(c.pasta);
  await salvarConfig(c);
  cfg = { ...cfg, ...c };
  preencher();
  $('save').disabled = true;
  $('msg').textContent = '';
  toast(grav.gravando ? 'Configurações salvas. As de captura valem na próxima gravação.' : 'Configurações salvas.');
};

// ---------------- atalhos ----------------

async function lerAtalhos() {
  const lista = await chrome.commands.getAll();
  atalhos = Object.fromEntries(lista.map(c => [c.name, c.shortcut]));
  $('atalhos').innerHTML = lista.filter(c => c.name !== '_execute_action').map(c =>
    `<div class=atalho><span>${escH(c.description)}</span>${c.shortcut ? `<kbd>${escH(c.shortcut)}</kbd>` : '<em>sem atalho</em>'}</div>`).join('');
  render();
}
$('mudarAtalhos').onclick = () => chrome.tabs.create({ url: paginaAtalhos() });
addEventListener('focus', lerAtalhos); // voltou da página de atalhos

/** Guarda em qual monitor está a tela gravada (quando dá para saber), para as janelas de print abrirem nele. */
async function identificarGravado() {
  const t = grav.stream && grav.stream.getVideoTracks()[0];
  grav.monitor = t ? await descobrirMonitor(t) : null;
  await guardarMonitorGravado(grav.monitor);
}

// ---------------- monitor: aviso quando parado, prévia ao vivo quando grava ----------------

let qtdMonitores = 0;
async function contarMonitores() {
  try { qtdMonitores = (await listarMonitores()).length; } catch (e) { qtdMonitores = 0; }
  render();
}
chrome.system.display.onDisplayChanged.addListener(contarMonitores);

function mostrarTela() {
  const on = grav.gravando, v = $('prev');
  $('telaVazia').hidden = on;
  $('telaSelo').hidden = !on;
  v.hidden = !on;
  if (on) {
    const t = grav.stream.getVideoTracks()[0];
    if (!v.srcObject || v.srcObject.getVideoTracks()[0] !== t) { v.srcObject = new MediaStream([t]); v.play().catch(() => {}); }
    const { largura, altura } = grav.tamanho;
    $('telaNome').textContent = (grav.monitor ? `Gravando o Monitor ${grav.monitor.numero}${grav.monitor.principal ? ' (principal)' : ''}` : 'Gravando este monitor')
      + (largura ? ` · ${largura}×${altura}` : '');
  } else {
    if (v.srcObject) { v.pause(); v.srcObject = null; }
    $('telaDica').textContent = qtdMonitores > 1
      ? `Este computador tem ${qtdMonitores} monitores. Ao clicar em gravar, você escolhe qual deles gravar.`
      : 'Ao clicar em gravar, você confirma o monitor que vai ser gravado.';
  }
}


// ---------------- estado ----------------

function render() {
  const on = grav.gravando;
  $('rec').classList.toggle('on', on);
  $('hero').classList.toggle('on', on);
  $('rec').title = on ? 'Parar a gravação' : 'Começar a gravar';
  $('ht').textContent = on ? 'Gravando ' + grav.superficie : 'Gravação parada';
  const k = atalhos.clipe ? `<kbd>${escH(atalhos.clipe)}</kbd> ou "Salvar clipe" guarda o clipe.` : '"Salvar clipe" guarda o clipe.';
  $('hs').innerHTML = on ? `Guardando os últimos ${grav.buffer}s. ${k}`
    : 'Clique no botão e escolha o monitor que quer gravar.';
  mostrarTela();
  $('avisoAba').hidden = !on;
  $('trocar').hidden = !on;
  $('bclip').disabled = !on;
  $('bclipTx').textContent = on ? `Os últimos ${grav.buffer}s, direto no trim` : 'Comece a gravar primeiro';
  document.title = on ? '● Gravando · Clipper' : 'Clipper';
  chrome.action.setBadgeText({ text: on ? 'REC' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

grav.aoMudar = motivo => {
  if (!grav.gravando) guardarMonitorGravado(null);
  render();
  if (motivo) { notificar(motivo); toast(motivo); }
};

/** A escolha da tela aparece na aba do painel: ela precisa estar visível. */
async function focarEstaAba() {
  try {
    const t = await chrome.tabs.getCurrent();
    if (!t) return;
    await chrome.tabs.update(t.id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } catch (e) { /* tudo bem */ }
}

async function fixarAba() {
  try {
    const t = await chrome.tabs.getCurrent();
    if (t && !t.pinned) await chrome.tabs.update(t.id, { pinned: true });
  } catch (e) { /* tudo bem */ }
}

async function contarFila() {
  try {
    const n = await dbContar('fila');
    $('qn').textContent = n;
    $('qn').hidden = !n;
  } catch (e) { /* banco ocupado */ }
}

// ---------------- ações ----------------

/** Abre a escolha da tela e começa a gravar. */
async function comecar() {
  $('ht').textContent = 'Escolha o monitor…';
  const avisos = await grav.iniciar(cfg);
  await identificarGravado();
  fixarAba();
  if (avisos.length) toast(avisos.join(' '));
}

async function noBotao(fn) {
  const botoes = [$('rec'), $('trocar')];
  if (botoes.some(b => b.disabled)) return;
  botoes.forEach(b => { b.disabled = true; });
  try {
    await fn();
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Gravação cancelada.' : 'Não consegui gravar: ' + (e.message || e));
  } finally {
    botoes.forEach(b => { b.disabled = false; });
    render();
  }
}

$('rec').onclick = () => noBotao(async () => {
  if (grav.gravando) {
    grav.parar();
    toast('Gravação parada.');
  } else {
    await comecar();
  }
});

$('trocar').onclick = () => noBotao(async () => {
  grav.parar();
  await comecar();
});

async function salvarClipe() {
  const c = await grav.clipe();
  const id = uid();
  await dbPut('fila', {
    id, nome: 'Clipe ' + dataCurta(), blob: c.blob, dur: null, temp: true, salvo: false,
    criado: Date.now(), ultimos: c.ultimos, audio: c.audio, thumb: null,
  });
  contarFila();
  return id;
}

$('bclip').onclick = async () => {
  try { await abrirTrim(await salvarClipe()); } catch (e) { toast(e.message || String(e)); }
};

/** Print a partir do painel: minimiza o navegador para ele não sair no print e tira da tela gravada. */
async function printDoPainel(modo) {
  const w = await chrome.windows.getCurrent();
  // sem gravação: pede a tela só para este print, e esconde esta janela durante a captura
  if (!grav.gravando) return modo === 'print' ? abrirCapturar('print', w.id) : abrirSelecao(null, undefined, w.id);
  const estado = w.state;
  await chrome.windows.update(w.id, { state: 'minimized' });
  await esperar(600);
  let id;
  try {
    id = await guardarImagem(await grav.quadro());
  } finally {
    await chrome.windows.update(w.id, { state: estado === 'minimized' ? 'normal' : estado });
  }
  await (modo === 'print' ? abrirSalvar(id) : abrirSelecao(id));
}
$('bshot').onclick = () => printDoPainel('print').catch(e => toast('Falha ao tirar o print: ' + e.message));
$('bsnip').onclick = () => printDoPainel('selecao').catch(e => toast('Falha ao tirar o print: ' + e.message));

$('otrim').onclick = () => abrirTrim();
$('ovid').onclick = () => $('arq').click();
$('arq').onchange = async () => {
  const arquivos = [...$('arq').files];
  $('arq').value = '';
  if (!arquivos.length) return;
  toast(arquivos.length > 1 ? 'Abrindo os vídeos…' : 'Abrindo o vídeo…');
  let ultimo = null;
  for (const f of arquivos) {
    ultimo = uid();
    await dbPut('fila', { id: ultimo, nome: f.name, blob: f, dur: null, temp: false, salvo: false,
      criado: Date.now(), ultimos: 0, audio: true, thumb: null });
  }
  contarFila();
  abrirTrim(ultimo);
};
$('fdown').onclick = () => chrome.downloads.showDefaultFolder();

// ---------------- pedidos do background e do menu do ícone ----------------

chrome.runtime.onMessage.addListener((m, _remetente, responder) => {
  if (m.para !== 'painel') return;
  (async () => {
    try {
      if (m.tipo === 'estado') return responder({ gravando: grav.gravando, buffer: grav.buffer, superficie: grav.superficie });
      if (m.tipo === 'alternar') {
        if (!grav.gravando) { // atalho de gravar: traz esta aba para a frente e já abre a escolha da tela
          responder({ iniciando: true });
          await focarEstaAba();
          noBotao(comecar);
          return;
        }
        grav.parar();
        notificar('Gravação parada.');
        return responder({ gravando: false });
      }
      if (m.tipo === 'clipe') {
        if (!grav.gravando) return responder({ erro: 'A gravação está parada. Comece a gravar no Clipper primeiro.' });
        return responder({ id: await salvarClipe() });
      }
      if (m.tipo === 'quadro') {
        if (!grav.gravando) return responder({ parado: true });
        return responder({ id: await guardarImagem(await grav.quadro()) });
      }
      responder(null);
    } catch (e) {
      responder({ erro: e.message || String(e) });
    }
  })();
  return true;
});

addEventListener('beforeunload', e => {
  if (grav.gravando) { e.preventDefault(); e.returnValue = ''; } // confirma antes de fechar a aba gravando
});
addEventListener('pagehide', () => chrome.action.setBadgeText({ text: '' }));

preencher();
contarMonitores();
lerAtalhos();
contarFila();
setInterval(() => { if (!document.hidden) contarFila(); }, 2000);
limparImagensVelhas().catch(() => {});

// aberto pelo atalho de gravar: já mostra a escolha da tela
if (new URLSearchParams(location.search).has('gravar')) {
  history.replaceState(null, '', location.pathname);
  noBotao(comecar);
}
