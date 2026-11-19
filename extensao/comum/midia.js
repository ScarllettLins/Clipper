// Vídeo no navegador: duração, miniatura e exportação de um trecho (o "Salvar trim").
//
// Sem ffmpeg, o corte é feito tocando o trecho escondido e regravando (MediaRecorder). Por isso salvar
// leva o mesmo tempo que o trecho dura. Sai em MP4 quando o navegador sabe gravar MP4; se não, em WebM.

export function evento(alvo, nome, ms = 10000) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => { limpar(); falha(new Error(`O vídeo demorou demais para responder (${nome}).`)); }, ms);
    const bom = () => { limpar(); ok(); };
    const ruim = () => { limpar(); falha(new Error('O navegador não conseguiu ler esse vídeo.')); };
    function limpar() { clearTimeout(t); alvo.removeEventListener(nome, bom); alvo.removeEventListener('error', ruim); }
    alvo.addEventListener(nome, bom);
    alvo.addEventListener('error', ruim);
  });
}

/** Vídeos gravados pelo navegador (WebM) vêm sem duração; pular para o fim faz o navegador descobrir. */
export async function corrigirDuracao(v) {
  if (isFinite(v.duration) && v.duration > 0) return v.duration;
  await new Promise(ok => {
    const t = setTimeout(fim, 5000);
    function f() { if (isFinite(v.duration) && v.duration > 0) fim(); }
    function fim() {
      clearTimeout(t);
      v.removeEventListener('durationchange', f);
      v.removeEventListener('timeupdate', f);
      ok();
    }
    v.addEventListener('durationchange', f);
    v.addEventListener('timeupdate', f);
    v.currentTime = 1e101;
  });
  const d = isFinite(v.duration) ? v.duration : 0;
  v.currentTime = 0;
  await evento(v, 'seeked', 5000).catch(() => {});
  return d;
}

/** {thumb: Blob jpg | null, dur: segundos | null} */
export async function miniatura(blob) {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  const u = URL.createObjectURL(blob);
  v.src = u;
  try {
    await evento(v, 'loadedmetadata');
    const dur = await corrigirDuracao(v);
    v.currentTime = Math.min(1, (dur || 2) / 2);
    await evento(v, 'seeked');
    const w = 192, h = Math.round(w * v.videoHeight / v.videoWidth) || 108;
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    return { thumb: await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 }), dur: dur || null };
  } catch (e) {
    return { thumb: null, dur: null };
  } finally {
    URL.revokeObjectURL(u);
    v.removeAttribute('src');
    v.load();
  }
}

/** Formato do arquivo salvo pelo trim. */
export function formatoSaida() {
  const opcoes = [
    // "avc1" sem perfil fixo primeiro: o navegador escolhe o nível certo para a resolução (o .640028 trava acima de 1080p)
    ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'mp4'], ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
  ];
  for (const [mime, ext] of opcoes) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext, tipo: mime.split(';')[0] };
  return { mime: '', ext: 'webm', tipo: 'video/webm' };
}

/** Regrava o trecho [a, b] (segundos) do vídeo. progresso(0..1). Devolve {blob, ext}. */
export async function exportarTrecho(blob, a, b, { audio = true, bps = 8_000_000, progresso = () => {} } = {}) {
  const { mime, ext, tipo } = formatoSaida();
  const v = document.createElement('video');
  v.preload = 'auto';
  v.muted = !audio; // com áudio, o som vai só para a gravação (WebAudio), não para a caixa de som
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:4px;height:4px';
  document.body.append(v); // fora do documento o Chrome pode economizar a decodificação
  const u = URL.createObjectURL(blob);
  v.src = u;
  let ctx = null;
  try {
    await evento(v, 'loadedmetadata', 20000);
    await corrigirDuracao(v);
    const trilhas = [];
    if (audio) {
      ctx = new AudioContext();
      await ctx.resume().catch(() => {}); // criado depois de esperas, pode nascer pausado (e o som sairia mudo)
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaElementSource(v).connect(dest);
      trilhas.push(...dest.stream.getAudioTracks());
    }
    const cap = v.captureStream();
    v.currentTime = a;
    await evento(v, 'seeked', 20000);
    if (!cap.getVideoTracks().length) await evento(cap, 'addtrack', 3000).catch(() => {});
    const rec = new MediaRecorder(new MediaStream([...cap.getVideoTracks(), ...trilhas]),
      { mimeType: mime || undefined, videoBitsPerSecond: bps, audioBitsPerSecond: 192_000 });
    const partes = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    const parado = new Promise(ok => { rec.onstop = ok; });
    const erro = new Promise((_, falha) => {
      rec.onerror = e => falha(new Error('O navegador não conseguiu gravar o vídeo' + (e.error && e.error.message ? ': ' + e.error.message : '.')));
    });
    erro.catch(() => {});
    rec.start(1000);
    await v.play();
    // acompanha a reprodução até o fim do trecho. requestVideoFrameCallback é o mais preciso, mas para quando a
    // janela some; timeupdate segura nesse caso. Se o vídeo parar de andar, avisa em vez de travar.
    await Promise.race([erro, new Promise((ok, falha) => {
      let acabou = false, visto = -1, mudou = Date.now();
      const fim = f => { if (acabou) return; acabou = true; clearInterval(vigia); v.removeEventListener('timeupdate', checar); v.removeEventListener('ended', checar); f(); };
      function checar(t) {
        if (acabou) return;
        t = typeof t === 'number' ? t : v.currentTime;
        if (t !== visto) { visto = t; mudou = Date.now(); }
        progresso(Math.min(1, Math.max(0, (t - a) / Math.max(0.1, b - a))));
        if (t >= b - 0.001 || v.ended) fim(ok);
      }
      const passo = (_agora, meta) => { if (acabou) return; checar(meta.mediaTime); v.requestVideoFrameCallback(passo); };
      const vigia = setInterval(() => {
        if (!v.paused && Date.now() - mudou < 15000) return;
        if (v.paused && !v.ended) v.play().catch(() => {}); // o navegador pausou: tenta continuar
        if (Date.now() - mudou >= 15000) fim(() => falha(new Error('O vídeo parou de tocar no meio do trecho. Deixe a janela do trim aberta e visível enquanto salva.')));
      }, 1000);
      v.requestVideoFrameCallback(passo);
      v.addEventListener('timeupdate', checar);
      v.addEventListener('ended', checar);
    })]);
    v.pause();
    if (rec.state !== 'inactive') rec.stop();
    await Promise.race([parado, erro]);
    progresso(1);
    return { blob: new Blob(partes, { type: tipo }), ext };
  } finally {
    if (ctx) ctx.close();
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
    URL.revokeObjectURL(u);
  }
}
