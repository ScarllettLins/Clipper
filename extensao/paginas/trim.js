// Tela de trim: lista a fila, toca o vídeo, marca início/fim e salva o corte.

import { dbTodos, dbPut, dbDel, dbAtualizar } from '../comum/db.js';
import { corrigirDuracao, miniatura, exportarTrecho, formatoSaida } from '../comum/midia.js';
import { lerConfig } from '../comum/config.js';
import { iniciarInterface, toast } from '../comum/interface.js';
import { uid, stamp, nomeArquivo, pastaSegura, notificar, baixarBlob } from '../comum/util.js';

iniciarInterface();
const $ = id => document.getElementById(id), v = $('v');
const I = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x=5.5 y=4 width=4.5 height=16 rx=1.2 /><rect x=14 y=4 width=4.5 height=16 rx=1.2 /></svg>',
  vol: '<svg viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2.4 stroke-linecap=round><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
let items = [], cur = null, a = 0, b = 0, d = 0, drag = null, marks = {}, videoUrl = null, exportando = false;
const thumbs = {};          // id → URL da miniatura
const gerando = new Set();  // miniaturas sendo geradas
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return m + ':' + (t - m * 60).toFixed(1).padStart(4, '0'); };
const fmtD = t => { if (t == null) return ''; const r = Math.round(t); return Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); };
$('play').innerHTML = I.play; $('mute').innerHTML = I.vol;
v.onplay = () => { $('play').innerHTML = I.pause; };
v.onpause = () => { $('play').innerHTML = I.play; };
$('mute').onclick = () => { v.muted = !v.muted; $('mute').innerHTML = v.muted ? I.mute : I.vol; };

// ---------------- fila ----------------

async function refresh(sel) {
  items = (await dbTodos('fila')).sort((x, y) => y.criado - x.criado);
  if (sel && items.some(i => i.id === sel)) pick(sel);
  else if (!items.some(i => i.id === cur)) pick(items[0] ? items[0].id : null);
  else renderList();
}

function thumbUrl(it) {
  if (!it.thumb) return '';
  return thumbs[it.id] || (thumbs[it.id] = URL.createObjectURL(it.thumb));
}

/** Miniatura e duração dos itens que ainda não têm (clipes novos e vídeos abertos). Um por vez. */
async function completarItens() {
  for (const it of items) {
    if (it.thumb || gerando.has(it.id)) continue;
    gerando.add(it.id);
    const m = await miniatura(it.blob);
    if (m.thumb) {
      it.thumb = m.thumb;
      if (!it.dur && m.dur) it.dur = m.dur;
      await dbAtualizar('fila', it.id, { thumb: it.thumb, dur: it.dur }).catch(() => {});
      renderList();
    }
  }
}

function renderList() {
  const L = $('list'); L.innerHTML = ''; $('qc').textContent = items.length;
  if (!items.length) { L.innerHTML = '<div class=empty>A fila está vazia.<br>Use o atalho de clipe<br>ou abra um vídeo.</div>'; return; }
  for (const it of items) {
    const e = document.createElement('div'); e.className = 'it' + (it.id === cur ? ' on' : '');
    const tag = it.salvo ? '<span class="tag c" style="--c:var(--ok)">salvo</span>'
      : it.temp ? '<span class="tag c" style="--c:var(--pri)">clipe</span>' : '<span class=tag>vídeo</span>';
    e.innerHTML = `<div class=th><span>${fmtD(it.dur)}</span></div><div class=meta><div class=nm></div><div class=sub>${tag}</div></div>
      <button class=rm title="Tirar da fila">${I.x}</button>`;
    const u = thumbUrl(it);
    if (u) e.querySelector('.th').style.backgroundImage = `url("${u}")`;
    e.querySelector('.nm').textContent = it.nome; e.title = it.nome;
    e.onclick = () => pick(it.id);
    e.querySelector('.rm').onclick = async ev => {
      ev.stopPropagation();
      const bt = ev.currentTarget;
      if (bt.disabled) return;
      if (it.temp && !it.salvo && !await askConfirm(`"${it.nome}" ainda não foi salvo. Tirar da fila e apagar o clipe?`)) return;
      bt.disabled = true;
      if (cur === it.id) { v.pause(); v.removeAttribute('src'); v.load(); }
      try { await dbDel('fila', it.id); } catch (err) { bt.disabled = false; return toast('Não consegui tirar da fila.'); }
      if (thumbs[it.id]) { URL.revokeObjectURL(thumbs[it.id]); delete thumbs[it.id]; }
      delete marks[it.id];
      items = items.filter(i => i.id !== it.id);
      if (cur === it.id) { cur = null; pick(items[0] ? items[0].id : null); } else renderList();
    };
    L.append(e);
  }
  completarItens();
}

function pick(id) {
  if (cur && d) marks[cur] = [a, b];
  cur = id; renderList(); v.pause(); d = 0; a = b = 0;
  const it = items.find(i => i.id === id);
  $('title').textContent = it ? it.nome : '';
  $('stage').classList.toggle('none', !id); $('save').disabled = !id;
  if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
  if (!it) { v.removeAttribute('src'); v.load(); draw(); return; }
  videoUrl = URL.createObjectURL(it.blob);
  v.src = videoUrl;
  draw();
}

v.onloadedmetadata = async () => {
  const id = cur;
  const dur = await corrigirDuracao(v); // clipes gravados pelo navegador vêm sem duração
  if (id !== cur) return;
  const it = items.find(i => i.id === cur) || {};
  d = dur || it.dur || 0;
  const m = marks[cur];
  if (m && m[1] <= d) [a, b] = m;
  else { a = it.ultimos ? Math.max(0, d - it.ultimos) : 0; b = d; } // clipe: já marca os últimos N segundos
  v.currentTime = a;
  draw();
  if (dur && !it.dur) { it.dur = dur; dbAtualizar('fila', it.id, { dur }).catch(() => {}); renderList(); }
};
v.onerror = () => {
  if (!cur) return;
  const c = v.error && v.error.code;
  toast(c === 4 ? 'O navegador não reconhece o formato desse vídeo (use MP4 ou WebM).' : c === 3 ? 'O vídeo está corrompido ou incompleto.'
    : c === 2 ? 'Falha ao carregar o vídeo.' : 'Não consegui abrir esse vídeo no player.');
};
v.onwaiting = () => { if (!v.paused) $('play').classList.add('carregando'); };
v.onplaying = () => $('play').classList.remove('carregando');

// ---------------- linha do tempo ----------------

function draw() {
  const P = t => (d ? t / d * 100 : 0) + '%';
  $('dl').style.width = P(a); $('dr').style.width = d ? (100 - b / d * 100) + '%' : '0';
  $('sel').style.left = P(a); $('sel').style.width = d ? ((b - a) / d * 100) + '%' : '0';
  $('ha').style.left = P(a); $('hb').style.left = P(b); $('head').style.left = P(v.currentTime);
  $('tc').textContent = fmt(v.currentTime); $('tt').textContent = fmt(d);
  $('ra').textContent = fmt(a); $('rb').textContent = fmt(b); $('rd').textContent = (b - a).toFixed(1) + 's';
}
(function loop() { if (d && !v.paused && v.currentTime >= b) v.currentTime = a; draw(); requestAnimationFrame(loop); })(); // toca em loop dentro do corte

const at = e => { const r = $('tl').getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * d; };
$('tl').onpointerdown = e => {
  if (!d) return;
  drag = e.target.id === 'ha' ? 'a' : e.target.id === 'hb' ? 'b' : 'p';
  if (drag !== 'p') v.pause();
  $('tl').setPointerCapture(e.pointerId); move(e);
};
$('tl').onpointermove = e => drag && move(e);
$('tl').onpointerup = () => { drag = null; };
function move(e) {
  const t = at(e);
  if (drag === 'a') { a = Math.min(t, b - 0.1); v.currentTime = a; }
  else if (drag === 'b') { b = Math.max(t, a + 0.1); v.currentTime = b; }
  else v.currentTime = t;
  draw();
}

// ---------------- player ----------------

function play() {
  if (!cur) return;
  if (!d) { toast('O vídeo ainda está carregando…'); return; }
  if (v.paused) {
    if (v.currentTime < a || v.currentTime >= b - 0.05) v.currentTime = a;
    v.play().catch(err => {
      if (err && err.name === 'NotAllowedError') { v.muted = true; $('mute').innerHTML = I.mute; v.play().catch(() => {}); }
      else if (err && err.name !== 'AbortError') toast('Não consegui tocar: ' + (err.message || err.name));
    });
  } else v.pause();
}
const setA = () => { if (d) { a = Math.min(v.currentTime, b - 0.1); draw(); } };
const setB = () => { if (d) { b = Math.max(v.currentTime, a + 0.1); draw(); } };
$('play').onclick = play; v.onclick = play; $('bi').onclick = setA; $('bo').onclick = setB;
document.querySelectorAll('button').forEach(x => x.addEventListener('mouseup', () => x.blur()));

function askConfirm(msg) {
  return new Promise(res => {
    const m = $('cfm'); $('cfmP').textContent = msg; m.hidden = false; v.pause(); setTimeout(() => $('cfmN').focus(), 30);
    const done = val => { m.hidden = true; $('cfmY').onclick = $('cfmN').onclick = m.onclick = document.onkeydown = null; res(val); };
    $('cfmY').onclick = () => done(true); $('cfmN').onclick = () => done(false); m.onclick = e => { if (e.target === m) done(false); };
    document.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
  });
}
onkeydown = e => {
  if (!$('cfm').hidden || exportando) return;
  const k = e.key.toLowerCase(), st = e.shiftKey ? 1 : 1 / 30;
  if (k === ' ') play(); else if (k === 'i') setA(); else if (k === 'o') setB();
  else if (k === 'arrowleft') { v.pause(); v.currentTime = Math.max(0, v.currentTime - st); }
  else if (k === 'arrowright') { v.pause(); v.currentTime = Math.min(d, v.currentTime + st); }
  else if (k === 'enter') save(); else return;
  e.preventDefault();
};

// ---------------- salvar ----------------

function nomeSugerido(it) {
  if (it.temp) return 'clipe_' + stamp(new Date(it.criado));
  return it.nome.replace(/\.[^.]+$/, '') + '_trim';
}

async function save() {
  if (!cur || $('save').disabled || exportando) return;
  v.pause();
  const it = items.find(i => i.id === cur);
  const { ext, tipo } = formatoSaida();
  const nome = nomeArquivo(nomeSugerido(it), ext, 'clipe_' + stamp());
  // 1) onde salvar (pergunta antes de regravar: o seletor precisa do clique "fresco")
  let destino = null;
  if (window.showSaveFilePicker) {
    try {
      destino = await showSaveFilePicker({ suggestedName: nome, id: 'clipper-videos', types: [{ description: 'Vídeo ' + ext.toUpperCase(), accept: { [tipo]: ['.' + ext] } }] });
    } catch (e) {
      if (e.name === 'AbortError') return;
      destino = null; // sem seletor: vai para Downloads
    }
  }
  // 2) regrava o trecho
  exportando = true; $('save').disabled = true; $('exp').hidden = false; $('expBar').style.width = '0';
  try {
    const r = await exportarTrecho(it.blob, a, b, { audio: it.audio !== false, progresso: p => { $('expBar').style.width = Math.round(p * 100) + '%'; } });
    let salvoComo = nome, idDownload = null;
    if (destino) {
      const w = await destino.createWritable();
      await w.write(r.blob);
      await w.close();
      salvoComo = destino.name;
    } else {
      const cfg = await lerConfig();
      idDownload = await baixarBlob(r.blob, `${pastaSegura(cfg.pasta)}/Vídeos/${nome}`);
    }
    it.salvo = true;
    await dbAtualizar('fila', it.id, { salvo: true }).catch(() => {});
    renderList();
    if (idDownload != null) toast('Salvo como ' + salvoComo, 'Mostrar na pasta', () => chrome.downloads.show(idDownload));
    else toast('Salvo como ' + salvoComo);
    if (document.hidden) notificar('Trim salvo: ' + salvoComo);
  } catch (e) {
    toast('Erro ao salvar: ' + (e.message || e));
  } finally {
    exportando = false; $('save').disabled = !cur; $('exp').hidden = true;
  }
}
$('save').onclick = save;

// ---------------- abrir vídeo do computador ----------------

$('add').onclick = () => $('arq').click();
$('arq').onchange = async () => {
  const arquivos = [...$('arq').files];
  $('arq').value = '';
  let ultimo = null;
  for (const f of arquivos) {
    ultimo = uid();
    await dbPut('fila', { id: ultimo, nome: f.name, blob: f, dur: null, temp: false, salvo: false, criado: Date.now(), ultimos: 0, audio: true, thumb: null });
  }
  if (ultimo) refresh(ultimo);
};

// o painel avisa quando um clipe novo chega
chrome.runtime.onMessage.addListener(m => {
  if (m.para === 'trim' && m.tipo === 'atualizar') refresh(m.sel);
});

refresh(new URLSearchParams(location.search).get('sel'));
