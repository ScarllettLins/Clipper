// Configurações salvas no chrome.storage.local.
// (O tema claro/escuro fica no localStorage, para a página já abrir com a cor certa: veja tema-inicial.js.)

export const PADRAO = {
  buffer: 60,           // segundos guardados para o clipe
  fps: 30,
  qualidade: 'media',   // alta | media | baixa
  audio: 'sistema',     // nenhum | sistema | microfone | ambos
  pasta: 'Clipper',     // pasta dentro de Downloads
};

export const QUALIDADE = { alta: 8_000_000, media: 4_000_000, baixa: 2_000_000 }; // bits por segundo

export async function lerConfig() {
  return { ...PADRAO, ...(await chrome.storage.local.get(PADRAO)) };
}

export async function salvarConfig(c) {
  const limpo = {};
  for (const k of Object.keys(PADRAO)) if (k in c) limpo[k] = c[k];
  await chrome.storage.local.set(limpo);
}
