// Gravação contínua da tela (usada pela página do painel).
//
// Como o buffer funciona: o navegador não deixa emendar pedaços soltos de vídeo sem recodificar, então em vez de
// pedaços de 2 s (como no Clipper desktop) rodam DOIS gravadores defasados. Cada um recomeça quando passa de
// 2×buffer, mas só se o outro já tiver pelo menos 1×buffer. Assim sempre existe um gravador com os últimos
// "buffer" segundos inteiros, e o clipe sai num arquivo só (com até 2×buffer; o trim já marca o final).

import { QUALIDADE } from './config.js';
import { escolherMonitor } from './monitores.js';

export function mimeGravacao() {
  for (const m of ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/** Vídeo do monitor escolhido (id vindo de escolherMonitor), na resolução real. */
export async function abrirMonitor(esc, { fps = 30, audio = false } = {}) {
  const desktop = extra => ({ mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: esc.id, ...extra } });
  const tela = await navigator.mediaDevices.getUserMedia({
    video: desktop({ maxFrameRate: fps, maxWidth: 7680, maxHeight: 4320 }),
    audio: audio && esc.audio ? desktop() : false,
  });
  const s = tela.getVideoTracks()[0].getSettings();
  if (s.displaySurface && s.displaySurface !== 'monitor') { // garantia: só o monitor inteiro, nunca aba ou janela
    tela.getTracks().forEach(t => t.stop());
    throw new Error('Escolha um monitor inteiro (não uma aba ou janela).');
  }
  return tela;
}

/** Um quadro do vídeo, em PNG. Funciona com a janela minimizada (não depende de requestAnimationFrame). */
export async function quadroDe(t) {
  let fonte = null, largura = 0, altura = 0;
  if (window.ImageCapture) {
    try {
      fonte = await new ImageCapture(t).grabFrame();
      largura = fonte.width; altura = fonte.height;
    } catch (e) { fonte = null; }
  }
  if (!fonte) { // sem ImageCapture: tira o quadro de um <video>
    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = new MediaStream([t]);
    await v.play();
    await new Promise(r => {
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => r());
      setTimeout(r, 300);
    });
    fonte = v; largura = v.videoWidth; altura = v.videoHeight;
  }
  const c = new OffscreenCanvas(largura, altura);
  c.getContext('2d').drawImage(fonte, 0, 0);
  if (fonte.close) fonte.close();
  if (fonte.srcObject) fonte.srcObject = null;
  return c.convertToBlob({ type: 'image/png' });
}

export class Gravador {
  constructor() {
    this.stream = null;
    this.slots = [null, null];
    this.fontes = [];
    this.ctx = null;
    this.monitor = null;       // monitor identificado (o painel preenche), ou null
    this.aoMudar = () => {};   // (motivo?) a gravação ligou/desligou
  }

  get gravando() { return !!this.stream; }

  get superficie() { return this.monitor ? 'o Monitor ' + this.monitor.numero : 'a tela'; }

  /** Tamanho real (pixels) do vídeo gravado. */
  get tamanho() {
    const t = this.stream && this.stream.getVideoTracks()[0];
    const s = t ? t.getSettings() : {};
    return { largura: s.width || 0, altura: s.height || 0 };
  }

  /** Liga a gravação (a pessoa escolhe a tela na janela do navegador). Devolve uma lista de avisos. */
  async iniciar(cfg) {
    if (this.stream) return [];
    const avisos = [];
    const querSistema = cfg.audio === 'sistema' || cfg.audio === 'ambos';
    const querMic = cfg.audio === 'microfone' || cfg.audio === 'ambos';
    const fps = Number(cfg.fps) || 30;

    // janela do navegador só com os monitores (sem abas e janelas), com a miniatura de cada um
    const esc = await escolherMonitor(querSistema);
    const tela = await abrirMonitor(esc, { fps, audio: querSistema });
    if (querSistema && !tela.getAudioTracks().length) {
      avisos.push('Sem som do computador: marque "Compartilhar áudio do sistema" na janela de escolha do monitor.');
    }

    let mic = null;
    if (querMic) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        avisos.push('Não consegui usar o microfone (permissão negada?). Gravando sem ele.');
      }
    }

    const trilhas = [...tela.getAudioTracks(), ...(mic ? mic.getAudioTracks() : [])];
    let audio = null;
    if (trilhas.length === 1) {
      audio = trilhas[0];
    } else if (trilhas.length > 1) { // som do computador + microfone: mistura numa trilha só
      this.ctx = new AudioContext();
      const dest = this.ctx.createMediaStreamDestination();
      for (const t of trilhas) this.ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      audio = dest.stream.getAudioTracks()[0];
    }

    const video = tela.getVideoTracks()[0];
    // o usuário clicou em "Parar compartilhamento" na barra do navegador
    video.addEventListener('ended', () => this.parar('A gravação parou porque o compartilhamento da tela foi encerrado.'));

    this.fontes = [tela, mic].filter(Boolean);
    this.stream = new MediaStream([video, ...(audio ? [audio] : [])]);
    this.temAudio = !!audio;
    this.buffer = Number(cfg.buffer) || 60;
    this.B = this.buffer * 1000;
    this.bps = QUALIDADE[cfg.qualidade] || QUALIDADE.media;
    this.mime = mimeGravacao();
    this.desde = Date.now();
    this._ciclo(0);
    this.aoMudar();
    return avisos;
  }

  _ciclo(i) {
    const velho = this.slots[i];
    if (velho && velho.rec.state !== 'inactive') {
      velho.rec.ondataavailable = null;
      try { velho.rec.stop(); } catch (e) { /* já parado */ }
    }
    const rec = new MediaRecorder(this.stream, {
      mimeType: this.mime || undefined, videoBitsPerSecond: this.bps, audioBitsPerSecond: 160_000,
    });
    const slot = { rec, partes: [], inicio: Date.now() };
    rec.ondataavailable = e => {
      if (e.data && e.data.size) slot.partes.push(e.data);
      this._verificar();
    };
    rec.start(1000); // um pedaço por segundo: o recomeço é decidido aqui, sem depender de timers (que o
    this.slots[i] = slot; // navegador atrasa em abas de fundo)
  }

  _verificar() {
    if (!this.stream) return;
    const agora = Date.now(), [s0, s1] = this.slots;
    if (!s1) {
      if (s0 && agora - s0.inicio >= this.B) this._ciclo(1);
      return;
    }
    for (const i of [0, 1]) {
      const s = this.slots[i], outro = this.slots[1 - i];
      if (agora - s.inicio >= 2 * this.B && agora - outro.inicio >= this.B) {
        this._ciclo(i);
        return;
      }
    }
  }

  /** Clipe com tudo o que o gravador mais antigo tem (inclui os últimos "buffer" segundos). Não para a gravação. */
  async clipe() {
    if (!this.stream) throw new Error('A gravação está parada. Comece a gravar no Clipper primeiro.');
    const s = this.slots.filter(Boolean).sort((a, b) => a.inicio - b.inicio)[0];
    const idade = s ? (Date.now() - s.inicio) / 1000 : 0;
    if (idade < 1.5) throw new Error('Ainda não há gravação suficiente. Espere uns segundos.');
    await new Promise(ok => { // pede o pedaço que está sendo gravado agora
      let feito = false;
      const f = () => {
        if (feito) return;
        feito = true;
        s.rec.removeEventListener('dataavailable', f);
        setTimeout(ok, 0);
      };
      s.rec.addEventListener('dataavailable', f);
      setTimeout(f, 2000);
      try { s.rec.requestData(); } catch (e) { f(); } // o gravador acabou de recomeçar: as partes já estão guardadas
    });
    return { blob: new Blob(s.partes.slice(), { type: 'video/webm' }), ultimos: this.buffer, audio: this.temAudio };
  }

  /** Um quadro da tela gravada, em PNG. */
  async quadro() {
    const t = this.stream && this.stream.getVideoTracks()[0];
    if (!t) throw new Error('A gravação está parada.');
    return quadroDe(t);
  }

  parar(motivo) {
    if (!this.stream) return;
    for (const s of this.slots) {
      if (s && s.rec.state !== 'inactive') {
        s.rec.ondataavailable = null;
        try { s.rec.stop(); } catch (e) { /* já parado */ }
      }
    }
    this.slots = [null, null];
    for (const f of this.fontes) f.getTracks().forEach(t => t.stop());
    this.stream.getTracks().forEach(t => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = null;
    this.ctx = null;
    this.fontes = [];
    this.monitor = null;
    this.aoMudar(motivo);
  }
}
