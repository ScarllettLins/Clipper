// Janela de salvar print: nome, Salvar (Downloads/<pasta>/Prints) ou Salvar como (escolhe a pasta).
// O print também vai para a área de transferência.

import { dbGet, dbDel } from '../comum/db.js';
import { lerConfig } from '../comum/config.js';
import { iniciarInterface, toast } from '../comum/interface.js';
import { stamp, nomeArquivo, pastaSegura, notificar, baixarBlob, fecharPagina } from '../comum/util.js';

iniciarInterface();
const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const reg = id ? await dbGet('imagens', id) : null;
const cfg = await lerConfig();
const pasta = pastaSegura(cfg.pasta) + '/Prints';
let ocupado = false, feito = false;

if (!reg) {
  $('conteudo').innerHTML = '<div class=vazio>Esse print não existe mais.</div>';
} else {
  $('img').src = URL.createObjectURL(reg.blob);
  $('destino').textContent = 'Downloads/' + pasta;
  $('n').value = `print_${stamp()}`;
  $('n').focus();
  $('n').select();
}

const arquivo = () => nomeArquivo($('n').value, 'png', `print_${stamp()}`);

async function copiar() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': reg.blob })]);
    return true;
  } catch (e) {
    return false;
  }
}

async function fim(copiado, nome) {
  feito = true;
  notificar((copiado ? 'Print salvo e copiado' : 'Print salvo') + ': ' + nome);
  await dbDel('imagens', id).catch(() => {});
  fecharPagina();
}

async function salvar() {
  if (!reg || ocupado) return;
  ocupado = true;
  try {
    const nome = arquivo();
    const copiado = await copiar();
    $('o').textContent = 'Salvando…';
    await baixarBlob(reg.blob, `${pasta}/${nome}`); // espera terminar antes de fechar a janela
    await fim(copiado, nome);
  } catch (e) {
    toast('Não consegui salvar: ' + (e.message || e));
  } finally {
    ocupado = false;
    $('o').textContent = 'Salvar';
  }
}

async function salvarComo() {
  if (!reg || ocupado) return;
  ocupado = true;
  try {
    const h = await showSaveFilePicker({ // primeiro: o seletor precisa do clique "fresco"
      suggestedName: arquivo(), id: 'clipper-prints', // o navegador lembra a última pasta usada
      types: [{ description: 'Imagem PNG', accept: { 'image/png': ['.png'] } }],
    });
    const w = await h.createWritable();
    await w.write(reg.blob);
    await w.close();
    await fim(await copiar(), h.name);
  } catch (e) {
    if (e.name !== 'AbortError') toast('Não consegui salvar: ' + (e.message || e));
  } finally {
    ocupado = false;
  }
}

async function descartar() {
  feito = true;
  if (id) await dbDel('imagens', id).catch(() => {});
  fecharPagina();
}

if (reg) {
  $('o').onclick = salvar;
  $('como').onclick = salvarComo;
  $('x').onclick = descartar;
}
onkeydown = e => {
  if (e.key === 'Enter') { e.preventDefault(); salvar(); }
  else if (e.key === 'Escape') { e.preventDefault(); descartar(); }
};
addEventListener('pagehide', () => { if (!feito && id) dbDel('imagens', id).catch(() => {}); }); // fechou no X
