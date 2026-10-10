// editor.js — panel del editor (4 estados: borrador · aceptado · publicado · rechazado)
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, doc, updateDoc, getDocs,
         getDoc, query, where, orderBy,
         Timestamp }                             from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const MAX_DESTACADOS = 5;

let articuloActual = null; // { id, datos, estado }

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

  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarTodo();
});

function cargarTodo() {
  cargarPendientes();
  cargarAceptados();
  cargarPublicados("noticias");
  cargarRechazados();
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
      await cargarPublicados(tabActivo ? tabActivo.dataset.cat : "noticias");
    });
  }

  return fila;
}

// --- ABRIR VISTA DE ARTÍCULO ---
function abrirVista(id, datos, estado) {
  articuloActual = { id, datos, estado };
  ocultarZonaRechazo();

  const parrafos = (datos.contenido || "").split("\n\n");
  const mitad    = Math.ceil(parrafos.length / 2);
  const parte1   = parrafos.slice(0, mitad).join("\n\n");
  const parte2   = parrafos.slice(mitad).join("\n\n");

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
    <p class="art-meta">${fechaTexto}</p>
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="art-imagen-principal">
    <div class="art-contenido">${parte1}</div>
    ${img2}
    <div class="art-contenido">${parte2}</div>
    ${img3}`;

  const btnAceptar  = document.getElementById("btn-aceptar");
  const btnPublicar = document.getElementById("btn-publicar");
  const btnRechazar = document.getElementById("btn-rechazar");
  const btnDestacar = document.getElementById("btn-destacar");

  document.getElementById("vista-estado").textContent = "";

  btnAceptar.style.display  = estado === "borrador"  ? "inline-block" : "none";
  btnPublicar.style.display = estado === "aceptado"  ? "inline-block" : "none";
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

// --- RECHAZAR: toggle zona ---
document.getElementById("btn-rechazar").addEventListener("click", () => {
  const zona = document.getElementById("zona-rechazo");
  zona.style.display = zona.style.display === "block" ? "none" : "block";
  if (zona.style.display === "block") {
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
