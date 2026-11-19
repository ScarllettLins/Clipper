// Print com seleção: escolhe a área e marca com caneta, marca-texto, seta, retângulo, texto ou pixelar.
// Coordenadas: tudo (seleção e desenhos) fica em pixels da imagem; k converte para a tela e ox/oy centralizam.

import { dbGet, dbDel, guardarImagem } from '../comum/db.js';
import { abrirSalvar, esconderJanela } from '../comum/janelas.js';
import { iniciarInterface } from '../comum/interface.js';
import { fecharPagina, esperar, notificar } from '../comum/util.js';
import { escolherMonitor, descobrirMonitor } from '../comum/monitores.js';
import { abrirMonitor, quadroDe } from '../comum/gravador.js';

iniciarInterface();
const $ = id => document.getElementById(id), cv = $('cv'), ctx = cv.getContext('2d'), img = new Image();
const CORES = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827', '#ffffff'];
let W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0, fase = 'sel', sel = null, ini = null, shapes = [], cur = null,
  tool = 'pen', cor = CORES[0], tam = 2, ocupado = false, feito = false;
const busca = new URLSearchParams(location.search);
let imgId = busca.get('id');

$('cores').innerHTML = CORES.map((c, i) => `<button class="cor${i ? '' : ' on'}" data-c="${c}" style="background:${c}" title="Cor"></button>`).join('');

/** Sem gravação: pede a tela, se esconde, tira o print e volta em tela cheia já com ele. Devolve o id ou null. */
async function capturarAqui() {
  const dica = $('tip').querySelector('span'), texto = dica.innerHTML;
  dica.textContent = 'Escolha a tela do print na janela do navegador…';
  let tela = null, voltar = async () => {};
  try {
    const esc = await escolherMonitor(false);
    const w = await chrome.windows.getCurrent();
    await chrome.windows.update(w.id, { state: 'minimized' }); // esta janela não pode sair no print
    voltar = await esconderJanela(busca.get('esconder')); // nem a do painel, quando o print sai de lá
    tela = await abrirMonitor(esc, { fps: 30 });
    await esperar(500);
    const t = tela.getVideoTracks()[0];
    const blob = await quadroDe(t);
    const m = await descobrirMonitor(t);
    tela.getTracks().forEach(x => x.stop());
    tela = null;
    const id = await guardarImagem(blob);
    await voltar(); voltar = async () => {}; // o painel volta antes, para a seleção ficar na frente
    if (m) await chrome.windows.update(w.id, { state: 'normal', ...m.bounds }).catch(() => {}); // volta no monitor do print
    await chrome.windows.update(w.id, { state: 'fullscreen', focused: true })
      .catch(() => chrome.windows.update(w.id, { state: 'maximized', focused: true }));
    dica.innerHTML = texto;
    return id;
  } catch (e) {
    if (e.name !== 'NotAllowedError') notificar('Não consegui tirar o print: ' + (e.message || e));
    return null;
  } finally {
    if (tela) tela.getTracks().forEach(x => x.stop());
    await voltar();
  }
}

if (!imgId && busca.has('capturar')) imgId = await capturarAqui();
const reg = imgId ? await dbGet('imagens', imgId) : null;
img.onload = () => { fit(); draw(); };
if (reg) img.src = URL.createObjectURL(reg.blob);
else fecharPagina(); // o print já foi salvo ou descartado

function fit() {
  dpr = devicePixelRatio || 1; W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const nw = img.naturalWidth || W, nh = img.naturalHeight || H;
  k = Math.max(nw / W, nh / H, dpr); // cabe inteira na tela, sem ampliar além do tamanho real
  ox = (W - nw / k) / 2; oy = (H - nh / k) / 2;
}
addEventListener('resize', () => { fit(); draw(); place(); });
const sx = x => x / k + ox, sy = y => y / k + oy; // imagem → tela
const P = e => [Math.min(img.naturalWidth, Math.max(0, (e.clientX - ox) * k)), Math.min(img.naturalHeight, Math.max(0, (e.clientY - oy) * k))];
const norm = r => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) });
const lw = () => [0, 3, 6, 11][tam] * k, fs = () => [0, 18, 28, 44][tam] * k;

function pix(c, s) {
  const r = norm(s);
  if (r.w < 2 || r.h < 2) return;
  const B = Math.max(10, Math.round(16 * k)), tw = Math.max(1, Math.ceil(r.w / B)), th = Math.max(1, Math.ceil(r.h / B));
  const t = document.createElement('canvas'); t.width = tw; t.height = th;
  t.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, tw, th);
  const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(t, 0, 0, tw, th, r.x, r.y, r.w, r.h);
  c.imageSmoothingEnabled = sm;
}

function shape(c, s) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = c.fillStyle = s.c; c.lineWidth = s.lw || 1;
  if (s.t === 'pen' || s.t === 'mark') {
    if (s.t === 'mark') { c.globalAlpha = 0.38; c.lineCap = 'butt'; }
    c.beginPath(); s.p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (s.p.length === 1) c.lineTo(s.p[0][0] + 0.1, s.p[0][1]);
    c.stroke();
  } else if (s.t === 'rect') {
    const r = norm(s); c.strokeRect(r.x, r.y, r.w, r.h);
  } else if (s.t === 'blur') {
    pix(c, s);
  } else if (s.t === 'arrow') {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), L = Math.max(s.lw * 3.2, 14 * k);
    c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2 - Math.cos(a) * L * 0.6, s.y2 - Math.sin(a) * L * 0.6); c.stroke();
    c.beginPath(); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - L * Math.cos(a - 0.42), s.y2 - L * Math.sin(a - 0.42));
    c.lineTo(s.x2 - L * Math.cos(a + 0.42), s.y2 - L * Math.sin(a + 0.42)); c.closePath(); c.fill();
  } else if (s.t === 'text') {
    c.font = `700 ${s.s}px Inter,Segoe UI,sans-serif`; c.textBaseline = 'top'; c.lineWidth = Math.max(2, s.s / 7);
    c.strokeStyle = s.c === '#111827' ? '#fff' : 'rgba(0,0,0,.6)';
    s.txt.split('\n').forEach((l, i) => { c.strokeText(l, s.x, s.y + i * s.s * 1.2); c.fillText(l, s.x, s.y + i * s.s * 1.2); });
  }
  c.restore();
}

function draw() {
  if (!img.naturalWidth) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr / k, 0, 0, dpr / k, ox * dpr, oy * dpr); ctx.drawImage(img, 0, 0);
  ctx.fillStyle = 'rgba(8,12,20,.5)'; ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
  if (!sel) return;
  const r = norm(sel);
  if (!r.w || !r.h) return;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  shapes.forEach(s => shape(ctx, s)); if (cur) shape(ctx, cur);
  ctx.restore();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--pri').trim() || '#38b6f0';
  ctx.lineWidth = 2 * k; ctx.setLineDash([6 * k, 4 * k]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
  const d = $('dims'); d.hidden = false; d.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  d.style.left = sx(r.x) + 'px'; d.style.top = Math.max(4, sy(r.y) - 24) + 'px';
}

function place() { // barra centralizada sob a seleção, sem sair da tela
  if (fase !== 'edit') return;
  const r = norm(sel), b = $('bar'), bw = b.offsetWidth, bh = b.offsetHeight;
  let x = sx(r.x + r.w / 2) - bw / 2, y = sy(r.y + r.h) + 10;
  if (x < 8) x = 8;
  if (x + bw > W - 8) x = W - 8 - bw;
  if (y + bh > H - 8) y = sy(r.y) - bh - 10;
  if (y < 8) y = Math.min(H - bh - 8, sy(r.y + r.h) - bh - 10);
  b.style.left = x + 'px'; b.style.top = y + 'px';
}

const dentro = ([x, y]) => { const r = norm(sel); return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; };

cv.onpointerdown = e => {
  if (e.button !== 0) return;
  const p = P(e);
  if (fase === 'sel') { ini = p; sel = { x: p[0], y: p[1], w: 0, h: 0 }; $('tip').hidden = true; cv.setPointerCapture(e.pointerId); return; }
  if (!$('txt').hidden) return commitTxt();
  if (!dentro(p)) {
    if (shapes.length) return; // sem desenhos ainda: clicar fora começa outra seleção
    fase = 'sel'; ini = p; sel = { x: p[0], y: p[1], w: 0, h: 0 }; $('bar').hidden = true; setCursor(); cv.setPointerCapture(e.pointerId); draw(); return;
  }
  if (tool === 'text') { e.preventDefault(); return openTxt(e, p); }
  cv.setPointerCapture(e.pointerId);
  const w = tool === 'mark' ? lw() * 3.2 : lw();
  cur = tool === 'pen' || tool === 'mark' ? { t: tool, p: [p], c: cor, lw: w }
    : tool === 'arrow' ? { t: 'arrow', x1: p[0], y1: p[1], x2: p[0], y2: p[1], c: cor, lw: w }
      : { t: tool, x: p[0], y: p[1], w: 0, h: 0, c: cor, lw: w };
  draw();
};
cv.onpointermove = e => {
  const p = P(e);
  if (fase === 'sel' && ini) { sel = { x: ini[0], y: ini[1], w: p[0] - ini[0], h: p[1] - ini[1] }; draw(); return; }
  if (!cur) return;
  if (cur.p) cur.p.push(p); else if (cur.t === 'arrow') { cur.x2 = p[0]; cur.y2 = p[1]; } else { cur.w = p[0] - cur.x; cur.h = p[1] - cur.y; }
  draw();
};
cv.onpointerup = () => {
  if (fase === 'sel' && ini) {
    ini = null;
    const r = norm(sel);
    if (r.w < 6 * k || r.h < 6 * k) { sel = null; $('dims').hidden = true; $('tip').hidden = false; draw(); return; }
    sel = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    fase = 'edit'; $('bar').hidden = false; setCursor(); place(); draw(); return;
  }
  if (cur) {
    const ok = cur.p ? true : cur.t === 'arrow' ? Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) > 3 * k : Math.abs(cur.w) > 3 && Math.abs(cur.h) > 3;
    if (ok) shapes.push(cur.p || cur.t === 'arrow' ? cur : { ...cur, ...norm(cur) });
    cur = null; draw();
  }
};
function setCursor() { cv.style.cursor = fase !== 'edit' ? 'crosshair' : tool === 'text' ? 'text' : 'crosshair'; }

let txtAberto = 0;
function openTxt(e, p) {
  const t = $('txt'); t.value = ''; t.hidden = false; t.style.left = e.clientX + 'px'; t.style.top = (e.clientY - 4) + 'px';
  t.style.color = cor === '#ffffff' ? '#111' : cor; t.style.fontSize = Math.round(fs() / k) + 'px';
  t.dataset.x = p[0]; t.dataset.y = p[1]; txtAberto = Date.now();
  t.focus(); requestAnimationFrame(() => t.focus());
}
function commitTxt() {
  const t = $('txt');
  if (t.hidden) return;
  const v = t.value.trim(); t.hidden = true;
  if (v) { shapes.push({ t: 'text', x: +t.dataset.x, y: +t.dataset.y + 2 * k, s: fs(), c: cor, txt: v }); draw(); }
}
$('txt').onkeydown = e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); commitTxt(); } else if (e.key === 'Escape') { e.preventDefault(); $('txt').hidden = true; }
};
$('txt').onblur = () => { if (Date.now() - txtAberto < 300) return $('txt').focus(); commitTxt(); };

document.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => setTool(b.dataset.t); });
function setTool(t) { commitTxt(); tool = t; document.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === t)); setCursor(); }
$('cores').onclick = e => {
  const b = e.target.closest('.cor');
  if (!b) return;
  cor = b.dataset.c; document.querySelectorAll('.cor').forEach(x => x.classList.toggle('on', x === b));
};
document.querySelectorAll('.sz').forEach(b => { b.onclick = () => { tam = +b.dataset.s; document.querySelectorAll('.sz').forEach(x => x.classList.toggle('on', x === b)); }; });
$('undo').onclick = () => { shapes.pop(); draw(); };
$('resel').onclick = () => { commitTxt(); shapes = []; sel = null; fase = 'sel'; $('bar').hidden = true; $('dims').hidden = true; $('tip').hidden = false; setCursor(); draw(); };
$('cancel').onclick = cancelar;
$('save').onclick = save;
document.querySelectorAll('#bar button').forEach(x => x.addEventListener('mouseup', () => x.blur()));

onkeydown = e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (!$('txt').hidden && tag !== 'INPUT') { $('txt').focus(); return; }
  if (e.key === 'Escape') { e.preventDefault(); return cancelar(); }
  if (tag === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); shapes.pop(); draw(); return; }
  if (fase !== 'edit') return;
  if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) { e.preventDefault(); return save(); }
  const m = { p: 'pen', m: 'mark', a: 'arrow', r: 'rect', t: 'text', b: 'blur' }[e.key.toLowerCase()];
  if (m) setTool(m);
};

async function cancelar() {
  feito = true;
  await dbDel('imagens', imgId).catch(() => {});
  fecharPagina();
}

/** Recorta a seleção com os desenhos e abre a janela de salvar (a mesma do print normal). */
async function save() {
  if (fase !== 'edit' || ocupado) return;
  commitTxt(); ocupado = true; $('save').textContent = 'Salvando…';
  try {
    const r = sel, o = new OffscreenCanvas(r.w, r.h), c = o.getContext('2d');
    c.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    c.translate(-r.x, -r.y);
    shapes.forEach(s => shape(c, s));
    const novo = await guardarImagem(await o.convertToBlob({ type: 'image/png' }));
    await abrirSalvar(novo);
  } catch (e) {
    ocupado = false; $('save').textContent = 'Salvar…';
    notificar('Não consegui salvar o print: ' + (e.message || e));
    return;
  }
  await cancelar(); // apaga a captura inteira e fecha esta janela
}

addEventListener('pagehide', () => { if (!feito) dbDel('imagens', imgId).catch(() => {}); });
setTimeout(() => focus(), 50);
