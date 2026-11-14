// interacciones.js — reacciones públicas y contador de lecturas (privado para staff/autor)
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, increment }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Claves permitidas también en firestore.rules (match /reacciones) — mantener sincronizadas
export const REACCIONES = {
  me_gusta:      { emoji: "👍", texto: "Me gusta" },
  me_encanta:    { emoji: "❤️", texto: "Me encanta" },
  me_sorprende:  { emoji: "😮", texto: "Me sorprende" },
  me_entristece: { emoji: "😢", texto: "Me entristece" },
  me_divierte:   { emoji: "😂", texto: "Me divierte" },
};

// 😂 solo en humor: evita risas en noticias trágicas. Para la futura categoría de humor:
//   <slug>: ["me_gusta", "me_encanta", "me_sorprende", "me_divierte"],
const REACCIONES_BASE = ["me_gusta", "me_encanta", "me_sorprende", "me_entristece"];
const REACCIONES_POR_CATEGORIA = {};

export function reaccionesDe(categoria) {
  return REACCIONES_POR_CATEGORIA[categoria] ?? REACCIONES_BASE;
}

// localStorage puede fallar (modo privado estricto); en ese caso se cuenta igual, sin recordar
function leerLocal(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardarLocal(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {}
}

// --- LECTURAS: una por dispositivo por día ---
export async function registrarLectura(idArticulo, uidAutor) {
  const hoy   = new Date().toISOString().slice(0, 10);
  const clave = `gaceta:lectura:${idArticulo}`;
  if (leerLocal(clave) === hoy) return;

  try {
    // merge + increment: crea el doc con lecturas=1 la primera vez, después suma 1
    await setDoc(doc(db, "lecturas", idArticulo),
      { lecturas: increment(1), uid: uidAutor ?? null },
      { merge: true });
    guardarLocal(clave, hoy);
  } catch (error) {
    console.warn("No se pudo registrar la lectura:", error.code ?? error);
  }
}

// --- REACCIONES: una por dispositivo por noticia (se puede cambiar o quitar) ---
export async function montarReacciones(idArticulo, categoria, contenedores) {
  const claves     = reaccionesDe(categoria);
  const claveLocal = `gaceta:reaccion:${idArticulo}`;
  const refDoc     = doc(db, "reacciones", idArticulo);

  let conteos = {};
  try {
    const snap = await getDoc(refDoc);
    if (snap.exists()) conteos = snap.data();
  } catch (error) {
    console.warn("No se pudieron leer las reacciones:", error.code ?? error);
  }

  let mia = leerLocal(claveLocal);
  if (mia && !claves.includes(mia)) mia = null;
  let enviando = false;

  function pintar() {
    contenedores.forEach(cont => {
      cont.innerHTML = claves.map(k => `
        <button type="button" class="reaccion ${mia === k ? "reaccion-activa" : ""}"
                data-clave="${k}" aria-pressed="${mia === k}" title="${REACCIONES[k].texto}">
          <span class="reaccion-emoji">${REACCIONES[k].emoji}</span>
          <span class="reaccion-num">${conteos[k] > 0 ? conteos[k] : ""}</span>
        </button>`).join("");
    });
  }

  async function reaccionar(clave) {
    if (enviando) return;
    enviando = true;

    const anterior = mia;
    const cambios  = {};
    if (anterior === clave) {
      cambios[clave] = increment(-1);           // quitar
      mia = null;
    } else {
      cambios[clave] = increment(1);            // poner
      if (anterior) cambios[anterior] = increment(-1);   // cambiar
      mia = clave;
    }

    // Actualización optimista: se ve al instante y se revierte si falla
    const previos = { ...conteos };
    for (const k of Object.keys(cambios)) {
      conteos[k] = Math.max(0, (conteos[k] ?? 0) + (k === mia ? 1 : -1));
    }
    pintar();

    try {
      await setDoc(refDoc, cambios, { merge: true });
      guardarLocal(claveLocal, mia);
    } catch (error) {
      console.warn("No se pudo guardar la reacción:", error.code ?? error);
      conteos = previos;
      mia     = anterior;
      pintar();
    } finally {
      enviando = false;
    }
  }

  contenedores.forEach(cont => {
    cont.addEventListener("click", (e) => {
      const btn = e.target.closest(".reaccion");
      if (btn) reaccionar(btn.dataset.clave);
    });
  });

  pintar();
}

// --- PANELES: rellena cada <span data-lecturas="idArticulo"> con "👁 N" ---
// Editor/admin leen cualquier doc; el escritor solo los suyos (reglas).
// Si el doc aún no existe (nadie la ha leído) las reglas lo niegan al escritor: se muestra 0.
export async function pintarLecturas(raiz) {
  const spans = [...raiz.querySelectorAll("[data-lecturas]")];
  await Promise.all(spans.map(async span => {
    let n = 0;
    try {
      const snap = await getDoc(doc(db, "lecturas", span.dataset.lecturas));
      if (snap.exists()) n = snap.data().lecturas ?? 0;
    } catch {}
    span.textContent = ` · 👁 ${n}`;
    span.title = `${n} lectura${n === 1 ? "" : "s"}`;
  }));
}
