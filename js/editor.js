// editor.js — panel del editor (4 estados: borrador · aceptado · publicado · rechazado)
import { auth, db, storage }                     from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, doc, updateDoc, getDocs,
         getDoc, query, where, orderBy, addDoc,
         deleteDoc, Timestamp }                  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL }      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const MAX_DESTACADOS  = 5;
const LIMITE_PORTADA  = 3 * 1024 * 1024;
const LIMITE_DOC      = 3 * 1024 * 1024;
const MIN_W = 600, MIN_H = 400;

function renderContenido(texto) {
  return (texto || "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>");
}

let articuloActual    = null; // { id, datos, estado }
let uidActual         = null;
let vidaEnEdicion     = null; // null = nueva · { id, datos } = edición
let quitarVidaPortada = false;
let quitarVidaImagen2 = false;

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "../login.html";
    return;
  }

  const snap = await getDoc(doc(db, "usuarios", usuario.uid));
  const rol  = snap.exists() ? snap.data().rol : null;

  if (rol === "escritor") {
    window.location.href = "../escritor/index.html";
    return;
  }
  if (rol !== "editor" && rol !== "admin") {
    window.location.href = "../login.html";
    return;
  }

  uidActual = usuario.uid;
  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarTodo();
});

function cargarTodo() {
  cargarPendientes();
  cargarAceptados();
  cargarPublicados("mundo");
  cargarRechazados();
  cargarVidaEstudiantil();
}

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login.html";
});

// --- CARGA POR ESTADO ---

async function cargarPendientes() {
  const lista = document.getElementById("lista-pendientes");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "borrador"),
      orderBy("fecha", "desc")
    ));
    renderLista(lista, snap, "borrador", "Sin artículos pendientes.");
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

async function cargarAceptados() {
  const lista = document.getElementById("lista-aceptados");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "aceptado")
    ));
    renderLista(lista, snap, "aceptado", "Sin artículos aceptados pendientes de publicación.");
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

async function cargarRechazados() {
  const lista = document.getElementById("lista-rechazados");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "rechazado")
    ));
    renderLista(lista, snap, "rechazado", "Sin artículos rechazados.");
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

async function cargarPublicados(categoria) {
  const lista = document.getElementById("lista-publicados");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado",    "==", "publicado"),
      where("categoria", "==", categoria),
      orderBy("fechaPublicacion", "desc")
    ));
    renderLista(lista, snap, "publicado", "Sin artículos publicados en esta categoría.");
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// --- RENDER LISTA GENÉRICO ---
function renderLista(lista, snap, estado, msgVacio) {
  if (snap.empty) {
    lista.innerHTML = `<p class='lista-vacia'>${msgVacio}</p>`;
    return;
  }
  lista.innerHTML = "";
  snap.forEach(documento => {
    const datos = documento.data();
    const fecha = (
      datos.fechaPublicacion ?? datos.fechaAceptado ?? datos.fechaRechazado ?? datos.fecha
    )?.toDate().toLocaleDateString("es-MX") ?? "—";
    lista.appendChild(crearFila(documento.id, datos, fecha, estado));
  });
}

// --- CREAR FILA ---
function crearFila(id, datos, fecha, estado) {
  const fila = document.createElement("div");
  fila.className = "articulo-fila articulo-fila-clickable";

  const badges = {
    borrador:  `<span class="estado-borrador">Pendiente</span>`,
    aceptado:  `<span class="estado-aceptado">Aceptado</span>`,
    publicado: `<span class="estado-publicado">Publicado</span>`,
    rechazado: `<span class="estado-rechazado">Rechazado</span>`,
  };

  const btnDestHTML = estado === "publicado" ? `
    <button class="btn-destacado ${datos.destacado ? "btn-destacado-activo" : ""}" data-id="${id}">
      ${datos.destacado ? "★ Destacado" : "☆ Destacar"}
    </button>` : "";

  fila.innerHTML = `
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
    <div class="articulo-fila-info">
      <p class="articulo-fila-titulo">${datos.titulo}</p>
      <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
    </div>
    ${badges[estado] ?? ""}
    ${btnDestHTML}`;

  fila.addEventListener("click", (e) => {
    if (e.target.closest(".btn-destacado")) return;
    abrirVista(id, datos, estado);
  });

  const btnDest = fila.querySelector(".btn-destacado");
  if (btnDest) {
    btnDest.addEventListener("click", async (e) => {
      e.stopPropagation();
      btnDest.disabled = true;
      await toggleDestacadoConLimite(id, datos);
      const tabActivo = document.querySelector("#tabs-publicados .tab.activo");
      await cargarPublicados(tabActivo ? tabActivo.dataset.cat : "mundo");
    });
  }

  return fila;
}

// --- ABRIR VISTA DE ARTÍCULO ---
function abrirVista(id, datos, estado) {
  articuloActual = { id, datos, estado };
  ocultarZonaRechazo();
  ocultarZonaEdicion();

  const parrafos = (datos.contenido || "").split("\n\n");
  const mitad    = Math.ceil(parrafos.length / 2);
  const parte1   = renderContenido(parrafos.slice(0, mitad).join("\n\n"));
  const parte2   = renderContenido(parrafos.slice(mitad).join("\n\n"));

  const img2 = datos.imagen2URL ? `<img src="${datos.imagen2URL}" alt="" class="art-imagen-extra">` : "";
  const img3 = datos.imagen3URL ? `<img src="${datos.imagen3URL}" alt="" class="art-imagen-extra">` : "";

  let fechaTexto;
  if (estado === "publicado" && datos.fechaPublicacion) {
    fechaTexto = datos.fechaPublicacion.toDate().toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric"
    });
  } else if (estado === "rechazado" && datos.fechaRechazado) {
    fechaTexto = `Rechazado el ${datos.fechaRechazado.toDate().toLocaleDateString("es-MX")}`;
  } else {
    fechaTexto = "Sin publicar";
  }

  const motivoHtml = estado === "rechazado" && datos.motivoRechazo
    ? `<div class="aviso-rechazo-vista">
        <strong>Motivo del rechazo:</strong>
        <span>${datos.motivoRechazo}</span>
       </div>` : "";

  document.getElementById("vista-articulo").innerHTML = `
    ${motivoHtml}
    <p class="art-categoria">${datos.categoria}</p>
    <h1 class="art-titulo">${datos.titulo}</h1>
    <p class="art-meta">${fechaTexto}${estado === "aceptado" ? ' · Escrito por <span id="escritor-nombre">—</span>' : ""}</p>
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="art-imagen-principal">
    <div class="art-contenido">${parte1}</div>
    ${img2}
    <div class="art-contenido">${parte2}</div>
    ${img3}`;

  if (estado === "aceptado" && datos.uid) {
    getDoc(doc(db, "usuarios", datos.uid)).then(snap => {
      const el = document.getElementById("escritor-nombre");
      if (el) el.textContent = snap.exists() ? (snap.data().nombre || datos.uid) : datos.uid;
    }).catch(() => {});
  }

  const btnAceptar  = document.getElementById("btn-aceptar");
  const btnPublicar = document.getElementById("btn-publicar");
  const btnEditar   = document.getElementById("btn-editar");
  const btnRechazar = document.getElementById("btn-rechazar");
  const btnDestacar = document.getElementById("btn-destacar");

  document.getElementById("vista-estado").textContent = "";

  btnAceptar.style.display  = estado === "borrador"  ? "inline-block" : "none";
  btnPublicar.style.display = estado === "aceptado"  ? "inline-block" : "none";
  btnEditar.style.display   = estado === "aceptado"  ? "inline-block" : "none";
  btnRechazar.style.display = (estado === "borrador" || estado === "aceptado") ? "inline-block" : "none";
  btnDestacar.style.display = estado === "publicado" ? "inline-block" : "none";

  btnAceptar.disabled  = false;
  btnPublicar.disabled = false;

  if (estado === "publicado") {
    btnDestacar.textContent = datos.destacado ? "★ Quitar destacado" : "☆ Destacar";
    btnDestacar.className   = `btn-destacado ${datos.destacado ? "btn-destacado-activo" : ""}`;
  }

  document.getElementById("panel-lista").style.display = "none";
  document.getElementById("panel-vista").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function ocultarZonaRechazo() {
  document.getElementById("zona-rechazo").style.display = "none";
  document.getElementById("motivo-rechazo").value       = "";
}

function ocultarZonaEdicion() {
  document.getElementById("zona-edicion").style.display = "none";
}

// --- VOLVER AL PANEL ---
document.getElementById("btn-volver").addEventListener("click", () => {
  document.getElementById("panel-vista").style.display = "none";
  document.getElementById("panel-lista").style.display = "block";
  articuloActual = null;
  ocultarZonaRechazo();
});

// --- ACEPTAR (borrador → aceptado) ---
document.getElementById("btn-aceptar").addEventListener("click", async () => {
  if (!articuloActual) return;
  const btn    = document.getElementById("btn-aceptar");
  const estado = document.getElementById("vista-estado");

  btn.disabled       = true;
  estado.style.color = "#555";
  estado.textContent = "Guardando...";

  try {
    await updateDoc(doc(db, "articulos", articuloActual.id), {
      estado:        "aceptado",
      fechaAceptado: Timestamp.now()
    });
    estado.style.color = "green";
    estado.textContent = "Artículo aceptado.";
    setTimeout(volverYRecargar, 800);
  } catch (error) {
    estado.style.color = "var(--rojo)";
    estado.textContent = "Error. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// --- PUBLICAR (aceptado → publicado) ---
document.getElementById("btn-publicar").addEventListener("click", async () => {
  if (!articuloActual) return;
  const btn    = document.getElementById("btn-publicar");
  const estado = document.getElementById("vista-estado");

  btn.disabled       = true;
  estado.style.color = "#555";
  estado.textContent = "Publicando...";

  try {
    await updateDoc(doc(db, "articulos", articuloActual.id), {
      estado:           "publicado",
      fechaPublicacion: Timestamp.now()
    });
    estado.style.color = "green";
    estado.textContent = "¡Artículo publicado!";
    setTimeout(volverYRecargar, 800);
  } catch (error) {
    estado.style.color = "var(--rojo)";
    estado.textContent = "Error. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// --- EDITAR (solo para aceptados) ---
document.getElementById("btn-editar").addEventListener("click", () => {
  const zona = document.getElementById("zona-edicion");
  if (zona.style.display === "block") {
    ocultarZonaEdicion();
    return;
  }
  ocultarZonaRechazo();
  document.getElementById("edicion-titulo").value    = articuloActual.datos.titulo    || "";
  document.getElementById("edicion-contenido").value = articuloActual.datos.contenido || "";
  zona.style.display = "block";
  document.getElementById("edicion-titulo").focus();
});

document.getElementById("btn-cancelar-edicion").addEventListener("click", ocultarZonaEdicion);

document.getElementById("btn-confirmar-edicion").addEventListener("click", async () => {
  if (!articuloActual) return;
  const titulo    = document.getElementById("edicion-titulo").value.trim();
  const contenido = document.getElementById("edicion-contenido").value.trim();
  if (!titulo)    { document.getElementById("edicion-titulo").focus();    return; }
  if (!contenido) { document.getElementById("edicion-contenido").focus(); return; }

  const btn    = document.getElementById("btn-confirmar-edicion");
  const estado = document.getElementById("vista-estado");

  btn.disabled       = true;
  estado.style.color = "#555";
  estado.textContent = "Guardando...";

  try {
    await updateDoc(doc(db, "articulos", articuloActual.id), { titulo, contenido });
    articuloActual.datos.titulo    = titulo;
    articuloActual.datos.contenido = contenido;
    abrirVista(articuloActual.id, articuloActual.datos, articuloActual.estado);
    document.getElementById("vista-estado").style.color = "green";
    document.getElementById("vista-estado").textContent = "Cambios guardados.";
  } catch (error) {
    estado.style.color = "var(--rojo)";
    estado.textContent = "Error. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// --- RECHAZAR: toggle zona ---
document.getElementById("btn-rechazar").addEventListener("click", () => {
  const zona = document.getElementById("zona-rechazo");
  zona.style.display = zona.style.display === "block" ? "none" : "block";
  if (zona.style.display === "block") {
    ocultarZonaEdicion();
    document.getElementById("motivo-rechazo").focus();
  }
});

document.getElementById("btn-cancelar-rechazo").addEventListener("click", ocultarZonaRechazo);

document.getElementById("btn-confirmar-rechazo").addEventListener("click", async () => {
  if (!articuloActual) return;
  const motivo = document.getElementById("motivo-rechazo").value.trim();
  if (!motivo) {
    document.getElementById("motivo-rechazo").focus();
    return;
  }

  const btn    = document.getElementById("btn-confirmar-rechazo");
  const estado = document.getElementById("vista-estado");

  btn.disabled       = true;
  estado.style.color = "#555";
  estado.textContent = "Rechazando...";

  try {
    await updateDoc(doc(db, "articulos", articuloActual.id), {
      estado:         "rechazado",
      motivoRechazo:  motivo,
      fechaRechazado: Timestamp.now()
    });
    estado.style.color = "green";
    estado.textContent = "Artículo rechazado.";
    setTimeout(volverYRecargar, 800);
  } catch (error) {
    estado.style.color = "var(--rojo)";
    estado.textContent = "Error. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// --- DESTACAR DESDE VISTA ---
document.getElementById("btn-destacar").addEventListener("click", async () => {
  if (!articuloActual || articuloActual.estado !== "publicado") return;
  const btn = document.getElementById("btn-destacar");
  btn.disabled = true;
  try {
    await toggleDestacadoConLimite(articuloActual.id, articuloActual.datos);
    btn.textContent = articuloActual.datos.destacado ? "★ Quitar destacado" : "☆ Destacar";
    btn.className   = `btn-destacado ${articuloActual.datos.destacado ? "btn-destacado-activo" : ""}`;
  } catch (error) {
    console.error(error);
  } finally {
    btn.disabled = false;
  }
});

// --- TOGGLE DESTACADO FIFO ---
async function toggleDestacadoConLimite(id, datos) {
  const nuevoEstado = !datos.destacado;

  if (nuevoEstado) {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado",        "==", "publicado"),
      where("categoria",     "==", datos.categoria),
      where("destacado",     "==", true),
      orderBy("fechaDestacado", "asc")
    ));
    if (snap.size >= MAX_DESTACADOS) {
      await updateDoc(doc(db, "articulos", snap.docs[0].id), { destacado: false });
    }
    await updateDoc(doc(db, "articulos", id), {
      destacado:      true,
      fechaDestacado: Timestamp.now()
    });
  } else {
    await updateDoc(doc(db, "articulos", id), { destacado: false });
  }

  datos.destacado = nuevoEstado;
}

// --- HELPER: volver y recargar ---
function volverYRecargar() {
  document.getElementById("panel-vista").style.display = "none";
  document.getElementById("panel-lista").style.display = "block";
  articuloActual = null;
  ocultarZonaRechazo();
  cargarTodo();
}

// --- TABS DE PUBLICADOS ---
document.querySelectorAll("#tabs-publicados .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#tabs-publicados .tab").forEach(t => t.classList.remove("activo"));
    tab.classList.add("activo");
    cargarPublicados(tab.dataset.cat);
  });
});

// ─────────────────────────────────────────────────
// VIDA ESTUDIANTIL
// ─────────────────────────────────────────────────

async function cargarVidaEstudiantil() {
  const lista = document.getElementById("lista-vida");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado",    "==", "publicado"),
      where("categoria", "==", "vida_estudiantil"),
      orderBy("fechaPublicacion", "desc")
    ));
    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>Sin publicaciones de vida estudiantil.</p>";
      return;
    }
    lista.innerHTML = "";
    snap.forEach(documento => {
      const datos = documento.data();
      const fecha = datos.fechaPublicacion?.toDate().toLocaleDateString("es-MX") ?? "—";
      lista.appendChild(crearFilaVida(documento.id, datos, fecha));
    });
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

function crearFilaVida(id, datos, fecha) {
  const fila = document.createElement("div");
  fila.className = "articulo-fila articulo-fila-clickable";
  fila.innerHTML = `
    <img src="${datos.imagenURL || ""}" alt="${datos.titulo}" class="articulo-miniatura">
    <div class="articulo-fila-info">
      <p class="articulo-fila-titulo">${datos.titulo}</p>
      <p class="articulo-fila-meta">Vida estudiantil · ${fecha}</p>
    </div>
    <span class="estado-publicado">Publicado</span>`;
  fila.addEventListener("click", () => abrirFormVida(id, datos));
  return fila;
}

function mostrarPanelVida() {
  document.getElementById("panel-lista").style.display    = "none";
  document.getElementById("panel-vida-form").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirFormVida(id, datos) {
  vidaEnEdicion     = { id, datos };
  quitarVidaPortada = false;
  quitarVidaImagen2 = false;

  document.getElementById("vida-titulo").value    = datos.titulo    || "";
  document.getElementById("vida-contenido").value = datos.contenido || "";
  document.getElementById("vida-imagen").value    = "";
  document.getElementById("vida-imagen2").value   = "";
  document.getElementById("error-vida-imagen").style.display  = "none";
  document.getElementById("error-vida-imagen2").style.display = "none";

  if (datos.imagenURL) {
    document.getElementById("vida-previa").src                        = datos.imagenURL;
    document.getElementById("vida-previa-contenedor").style.display   = "block";
    document.getElementById("btn-quitar-vida-portada").style.display  = "inline-block";
  } else {
    document.getElementById("vida-previa-contenedor").style.display   = "none";
    document.getElementById("btn-quitar-vida-portada").style.display  = "none";
  }

  if (datos.imagen2URL) {
    document.getElementById("vida-previa2").src                        = datos.imagen2URL;
    document.getElementById("vida-previa2-contenedor").style.display   = "block";
    document.getElementById("btn-quitar-vida-imagen2").style.display   = "inline-block";
  } else {
    document.getElementById("vida-previa2-contenedor").style.display   = "none";
    document.getElementById("btn-quitar-vida-imagen2").style.display   = "none";
  }

  document.getElementById("ayuda-vida-imagen").textContent      = "Máx 3 MB · JPG, PNG o WebP · Mín 600 × 400 px · Deja vacío para conservar la imagen actual.";
  document.getElementById("titulo-vida-form").textContent       = "EDITAR PUBLICACIÓN";
  document.getElementById("btn-publicar-vida").textContent      = "Guardar cambios";
  document.getElementById("btn-eliminar-vida").style.display    = "inline-block";
  document.getElementById("vida-form-estado").textContent       = "";

  mostrarPanelVida();
}

document.getElementById("btn-nueva-vida").addEventListener("click", () => {
  vidaEnEdicion     = null;
  quitarVidaPortada = false;
  quitarVidaImagen2 = false;

  document.getElementById("form-vida").reset();
  document.getElementById("vida-imagen").value  = "";
  document.getElementById("vida-imagen2").value = "";
  document.getElementById("vida-previa").src    = "";
  document.getElementById("vida-previa2").src   = "";

  document.getElementById("vida-previa-contenedor").style.display   = "none";
  document.getElementById("vida-previa2-contenedor").style.display   = "none";
  document.getElementById("btn-quitar-vida-portada").style.display   = "none";
  document.getElementById("btn-quitar-vida-imagen2").style.display   = "none";
  document.getElementById("error-vida-imagen").style.display         = "none";
  document.getElementById("error-vida-imagen2").style.display        = "none";
  document.getElementById("ayuda-vida-imagen").textContent           = "Obligatoria · Máx 3 MB · JPG, PNG o WebP · Mín 600 × 400 px";
  document.getElementById("titulo-vida-form").textContent            = "NUEVA PUBLICACIÓN";
  document.getElementById("btn-publicar-vida").textContent           = "Publicar";
  document.getElementById("btn-eliminar-vida").style.display         = "none";
  document.getElementById("vida-form-estado").textContent            = "";

  mostrarPanelVida();
});

document.getElementById("btn-cancelar-vida").addEventListener("click", () => {
  document.getElementById("panel-vida-form").style.display = "none";
  document.getElementById("panel-lista").style.display     = "block";
  vidaEnEdicion     = null;
  quitarVidaPortada = false;
  quitarVidaImagen2 = false;
});

// Validación de imagen (duplicada de escritor.js por diseño sin bundler)
async function validarImagen(archivo, limite, checkDims) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
    return "Solo se admiten imágenes JPG, PNG o WebP.";
  }
  const mb = (limite / 1024 / 1024).toFixed(0);
  if (archivo.size > limite) {
    return `La imagen no puede superar ${mb} MB. Puedes comprimirla en squoosh.app`;
  }
  if (!checkDims) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < MIN_W || img.naturalHeight < MIN_H) {
        resolve(`La imagen debe medir al menos ${MIN_W} × ${MIN_H} px (tiene ${img.naturalWidth} × ${img.naturalHeight} px).`);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve("No se pudo leer la imagen."); };
    img.src = url;
  });
}

async function manejarCambioImagenVida(e, limite, checkDims, idError, idPrevia, idPreviaCont) {
  const archivo    = e.target.files[0];
  const errEl      = document.getElementById(idError);
  const previaCont = document.getElementById(idPreviaCont);
  errEl.style.display = "none";
  if (!archivo) return;
  const error = await validarImagen(archivo, limite, checkDims);
  if (error) {
    errEl.textContent        = error;
    errEl.style.display      = "block";
    e.target.value           = "";
    previaCont.style.display = "none";
    return;
  }
  document.getElementById(idPrevia).src = URL.createObjectURL(archivo);
  previaCont.style.display = "block";
}

document.getElementById("vida-imagen").addEventListener("change", (e) => {
  quitarVidaPortada = false;
  manejarCambioImagenVida(e, LIMITE_PORTADA, true, "error-vida-imagen", "vida-previa", "vida-previa-contenedor");
});

document.getElementById("vida-imagen2").addEventListener("change", (e) => {
  quitarVidaImagen2 = false;
  manejarCambioImagenVida(e, LIMITE_DOC, false, "error-vida-imagen2", "vida-previa2", "vida-previa2-contenedor");
});

document.getElementById("btn-quitar-vida-portada").addEventListener("click", () => {
  quitarVidaPortada = true;
  document.getElementById("vida-imagen").value                      = "";
  document.getElementById("vida-previa").src                        = "";
  document.getElementById("vida-previa-contenedor").style.display   = "none";
  document.getElementById("btn-quitar-vida-portada").style.display  = "none";
  document.getElementById("error-vida-imagen").style.display        = "none";
});

document.getElementById("btn-quitar-vida-imagen2").addEventListener("click", () => {
  quitarVidaImagen2 = true;
  document.getElementById("vida-imagen2").value                     = "";
  document.getElementById("vida-previa2").src                       = "";
  document.getElementById("vida-previa2-contenedor").style.display  = "none";
  document.getElementById("btn-quitar-vida-imagen2").style.display  = "none";
});

async function subirImagenVida(archivo) {
  const ruta       = `articulos/${uidActual}/${Date.now()}_${archivo.name}`;
  const storageRef = ref(storage, ruta);
  await uploadBytes(storageRef, archivo);
  return getDownloadURL(storageRef);
}

document.getElementById("form-vida").addEventListener("submit", async (e) => {
  e.preventDefault();

  const titulo      = document.getElementById("vida-titulo").value.trim();
  const contenido   = document.getElementById("vida-contenido").value.trim();
  const archivo     = document.getElementById("vida-imagen").files[0];
  const archivo2    = document.getElementById("vida-imagen2").files[0];
  const errImg      = document.getElementById("error-vida-imagen");
  const errImg2     = document.getElementById("error-vida-imagen2");
  const estadoTexto = document.getElementById("vida-form-estado");
  const btnPublicar = document.getElementById("btn-publicar-vida");

  if (!vidaEnEdicion && !archivo) {
    errImg.textContent   = "La imagen de portada es obligatoria.";
    errImg.style.display = "block";
    return;
  }

  if (archivo) {
    const error = await validarImagen(archivo, LIMITE_PORTADA, true);
    if (error) { errImg.textContent = error; errImg.style.display = "block"; return; }
    errImg.style.display = "none";
  }

  if (archivo2) {
    const error = await validarImagen(archivo2, LIMITE_DOC, false);
    if (error) { errImg2.textContent = error; errImg2.style.display = "block"; return; }
    errImg2.style.display = "none";
  }

  btnPublicar.disabled      = true;
  estadoTexto.style.color   = "#555";

  try {
    let imagenURL  = vidaEnEdicion?.datos?.imagenURL  ?? null;
    let imagen2URL = vidaEnEdicion?.datos?.imagen2URL ?? null;

    if (archivo)  { estadoTexto.textContent = "Subiendo portada...";  imagenURL  = await subirImagenVida(archivo);  }
    if (archivo2) { estadoTexto.textContent = "Subiendo imagen...";   imagen2URL = await subirImagenVida(archivo2); }

    if (!vidaEnEdicion) {
      estadoTexto.textContent = "Publicando...";
      await addDoc(collection(db, "articulos"), {
        titulo,
        contenido,
        estado:           "publicado",
        categoria:        "vida_estudiantil",
        subcategoria:     null,
        continente:       null,
        uid:              null,
        imagenURL,
        imagen2URL:       imagen2URL ?? null,
        fecha:            Timestamp.now(),
        fechaPublicacion: Timestamp.now(),
      });
      estadoTexto.style.color = "green";
      estadoTexto.textContent = "¡Publicado!";
    } else {
      estadoTexto.textContent = "Guardando...";
      await updateDoc(doc(db, "articulos", vidaEnEdicion.id), {
        titulo,
        contenido,
        ...(archivo  ? { imagenURL }  : quitarVidaPortada  ? { imagenURL: null }  : {}),
        ...(archivo2 ? { imagen2URL } : quitarVidaImagen2  ? { imagen2URL: null } : {}),
      });
      estadoTexto.style.color = "green";
      estadoTexto.textContent = "Cambios guardados.";
    }

    setTimeout(() => {
      document.getElementById("panel-vida-form").style.display = "none";
      document.getElementById("panel-lista").style.display     = "block";
      vidaEnEdicion     = null;
      quitarVidaPortada = false;
      quitarVidaImagen2 = false;
      cargarVidaEstudiantil();
    }, 1200);

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error. Intenta de nuevo.";
    console.error(error);
  } finally {
    btnPublicar.disabled = false;
  }
});

document.getElementById("btn-eliminar-vida").addEventListener("click", async () => {
  if (!vidaEnEdicion) return;
  if (!confirm(`¿Eliminar "${vidaEnEdicion.datos.titulo}"? Esta acción no se puede deshacer.`)) return;

  const btn         = document.getElementById("btn-eliminar-vida");
  const estadoTexto = document.getElementById("vida-form-estado");

  btn.disabled              = true;
  estadoTexto.style.color   = "#555";
  estadoTexto.textContent   = "Eliminando...";

  try {
    await deleteDoc(doc(db, "articulos", vidaEnEdicion.id));
    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Publicación eliminada.";
    setTimeout(() => {
      document.getElementById("panel-vida-form").style.display = "none";
      document.getElementById("panel-lista").style.display     = "block";
      vidaEnEdicion     = null;
      quitarVidaPortada = false;
      quitarVidaImagen2 = false;
      cargarVidaEstudiantil();
    }, 800);
  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al eliminar.";
    btn.disabled = false;
    console.error(error);
  }
});
