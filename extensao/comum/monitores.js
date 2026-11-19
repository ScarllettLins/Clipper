// Escolha do monitor e qual monitor está sendo gravado.
//
// Quem escolhe o monitor é a janela do navegador (regra de segurança: nenhuma extensão pode escolher sozinha).
// Depois, o Clipper tenta descobrir qual monitor veio pelo tamanho do vídeo, só para abrir as janelas de print
// nele. Se não der para saber (monitores do mesmo tamanho), as janelas abrem onde o navegador quiser.

const ESCALAS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4]; // escalas do Windows (100%, 125%…)

/** [{id, numero, principal, bounds: {left, top, width, height}, escala}]: o principal é o 1, os outros da esquerda para a direita. */
export async function listarMonitores() {
  const lista = (await chrome.system.display.getInfo()).filter(d => d.isEnabled !== false && !d.mirroringSourceId);
  lista.sort((a, b) => (b.isPrimary - a.isPrimary) || (a.bounds.left - b.bounds.left) || (a.bounds.top - b.bounds.top));
  return lista.map((d, i) => ({ id: d.id, numero: i + 1, principal: !!d.isPrimary, bounds: d.bounds, escala: d.dpiX ? d.dpiX / 96 : 1 }));
}

/** Monitor com esse tamanho de vídeo (pixels reais). null se nenhum ou se mais de um tiver o mesmo tamanho. */
export function identificar(monitores, largura, altura) {
  const achados = monitores.filter(m => [m.escala, ...ESCALAS].some(e =>
    Math.abs(m.bounds.width * e - largura) <= 3 && Math.abs(m.bounds.height * e - altura) <= 3));
  return achados.length === 1 ? achados[0] : null;
}

/** Monitor do vídeo (pelo tamanho), ou null. */
export async function descobrirMonitor(track) {
  try {
    const s = track.getSettings();
    return identificar(await listarMonitores(), s.width || 0, s.height || 0);
  } catch (e) { return null; }
}

/** Abre a janela do navegador com os monitores. Devolve {id, audio}, ou erro NotAllowedError se cancelar. */
export function escolherMonitor(comAudio) {
  return new Promise((ok, falha) => {
    chrome.desktopCapture.chooseDesktopMedia(comAudio ? ['screen', 'audio'] : ['screen'], (id, opcoes) => {
      if (!id) {
        const e = new Error('Escolha da tela cancelada.');
        e.name = 'NotAllowedError';
        return falha(e);
      }
      ok({ id, audio: !!(opcoes && opcoes.canRequestAudioTrack) });
    });
  });
}

// ---------------- monitor gravado (para abrir as janelas de print nele) ----------------

export async function guardarMonitorGravado(m) {
  try { await chrome.storage.session.set({ monitorGravado: m ? m.bounds : null }); } catch (e) { /* sem sessão */ }
}

export async function monitorGravado() {
  try { return (await chrome.storage.session.get('monitorGravado')).monitorGravado || null; } catch (e) { return null; }
}
