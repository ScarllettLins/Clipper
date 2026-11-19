// Menu do ícone da extensão. As ações rodam no background, depois que o menu fecha (para ele não sair no print).

const $ = id => document.getElementById(id);

function estadoPainel() {
  return new Promise(ok => chrome.runtime.sendMessage({ para: 'painel', tipo: 'estado' }, r => {
    if (chrome.runtime.lastError) return ok(null);
    ok(r ?? null);
  }));
}

const est = await estadoPainel();
const on = !!(est && est.gravando);
$('st').classList.toggle('on', on);
$('stt').textContent = on ? 'Gravando' : 'Parado';
$('bclip').disabled = !on;
$('bpainel').textContent = on ? 'Abrir o Clipper' : 'Abrir o Clipper para gravar';
if (on) $('dica').textContent = 'Gravando. Os prints saem da tela que está sendo gravada.';

for (const c of await chrome.commands.getAll()) {
  const k = document.querySelector(`kbd[data-k="${c.name}"]`);
  if (k && c.shortcut) { k.textContent = c.shortcut; k.hidden = false; }
}

document.querySelectorAll('[data-acao]').forEach(b => {
  b.onclick = () => {
    const acao = b.dataset.acao;
    const atraso = acao === 'print' || acao === 'selecao' ? 250 : 0;
    chrome.runtime.sendMessage({ para: 'fundo', tipo: 'acao', acao, atraso }).catch(() => {});
    window.close();
  };
});
