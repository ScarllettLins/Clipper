// Banco local (IndexedDB) da extensão.
//   fila     clipes e vídeos da tela de trim: {id, nome, blob, dur, temp, salvo, criado, ultimos, audio, thumb}
//              temp=true: clipe capturado, que só existe aqui (apagar da fila apaga o clipe)
//              ultimos: quantos segundos do fim o trim já marca (o clipe pode vir com um pouco a mais)
//   imagens  prints esperando ser salvos ou editados: {id, blob, criado}

import { uid } from './util.js';

const NOME = 'clipper', VERSAO = 1;
let aberto = null;

function abrir() {
  if (!aberto) {
    aberto = new Promise((ok, falha) => {
      const r = indexedDB.open(NOME, VERSAO);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('imagens')) db.createObjectStore('imagens', { keyPath: 'id' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => { aberto = null; falha(r.error); };
    });
  }
  return aberto;
}

async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(store, modo);
    const req = fn(t.objectStore(store));
    let res;
    if (req) req.onsuccess = () => { res = req.result; };
    t.oncomplete = () => ok(res);
    t.onerror = t.onabort = () => falha(t.error);
  });
}

export const dbPut = (store, obj) => tx(store, 'readwrite', s => s.put(obj));
export const dbGet = (store, id) => tx(store, 'readonly', s => s.get(id));
export const dbDel = (store, id) => tx(store, 'readwrite', s => s.delete(id));
export const dbTodos = store => tx(store, 'readonly', s => s.getAll());
export const dbContar = store => tx(store, 'readonly', s => s.count());

export async function dbAtualizar(store, id, campos) {
  const o = await dbGet(store, id);
  if (o) {
    Object.assign(o, campos);
    await dbPut(store, o);
  }
  return o;
}

// ---------------- prints ----------------

export async function guardarImagem(blob) {
  const id = uid();
  await dbPut('imagens', { id, blob, criado: Date.now() });
  return id;
}

/** Apaga prints que ficaram para trás (janela fechada sem salvar e sem descartar). */
export async function limparImagensVelhas(horas = 12) {
  const limite = Date.now() - horas * 3600_000;
  for (const i of await dbTodos('imagens')) if (i.criado < limite) await dbDel('imagens', i.id);
}
