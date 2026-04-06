// editor.js — panel del editor
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, query, where, orderBy,
         getDocs, getDoc, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Estado del panel de edición
let articuloId    = null;
let articuloDatos = null;

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "../paginas/login.html";
    return;
  }

  const snap = await getDoc(doc(db, "usuarios", usuario.uid));
  const rol  = snap.exists() ? snap.data().rol : null;

  if (rol === "escritor") {
    window.location.href = "../escritor/index.html";
    return;
  }
  if (rol !== "editor") {
    window.location.href = "../paginas/login.html";
    return;
  }

  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarPendientes();
  cargarPublicados();
  cargarDestacados("investigacion");
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../paginas/login.html";
});

// ================================================
// SECCIÓN 1: PENDIENTES
// ================================================
async function cargarPendientes() {
  const lista = document.getElementById("lista-pendientes");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";

  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "borrador"),
      orderBy("fecha", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>No hay borradores pendientes.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach((documento) => {
      const datos = documento.data();
      const fecha = datos.fecha?.toDate().toLocaleDateString("es-MX") ?? "—";
      const fila  = document.createElement("div");
      fila.className = "articulo-fila articulo-fila-clickable";
      fila.innerHTML = `
        <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
        <div class="articulo-fila-info">
          <p class="articulo-fila-titulo">${datos.titulo}</p>
          <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
        </div>
        <span class="estado-borrador">Pendiente</span>`;
      fila.addEventListener("click", () => abrirDetalle(documento.id, datos, "publicar"));
      lista.appendChild(fila);
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// ================================================
// SECCIÓN 2: PUBLICADOS
// ================================================
async function cargarPublicados() {
  const lista = document.getElementById("lista-publicados");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";

  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      orderBy("fechaPublicacion", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>No hay artículos publicados aún.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach((documento) => {
      const datos = documento.data();
      const fecha = datos.fechaPublicacion?.toDate().toLocaleDateString("es-MX") ?? "—";
      const fila  = document.createElement("div");
      fila.className = "articulo-fila articulo-fila-clickable";
      fila.innerHTML = `
        <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
        <div class="articulo-fila-info">
          <p class="articulo-fila-titulo">${datos.titulo}</p>
          <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
        </div>
        <span class="estado-publicado">Publicado</span>`;
      fila.addEventListener("click", () => abrirDetalle(documento.id, datos, "editar"));
      lista.appendChild(fila);
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// ================================================
// SECCIÓN 3: DESTACADOS
// ================================================
async function cargarDestacados(categoria) {
  const lista = document.getElementById("lista-destacados");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";

  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", categoria),
      orderBy("fechaPublicacion", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>No hay artículos publicados en esta categoría.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach((documento) => {
      const datos     = documento.data();
      const destacado = datos.destacado === true;
      const fila      = document.createElement("div");
      fila.className  = "articulo-fila";
      fila.innerHTML  = `
        <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
        <div class="articulo-fila-info">
          <p class="articulo-fila-titulo">${datos.titulo}</p>
          <p class="articulo-fila-meta">${datos.categoria}</p>
        </div>
        <button class="btn-destacado ${destacado ? 'btn-destacado-activo' : ''}"
                data-id="${documento.id}"
                data-destacado="${destacado}">
          ${destacado ? "★ Destacado" : "☆ Destacar"}
        </button>`;

      fila.querySelector(".btn-destacado").addEventListener("click", (e) => {
        toggleDestacado(documento.id, destacado, e.currentTarget);
      });

      lista.appendChild(fila);
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// Toggle destacado sin abrir el panel de edición
async function toggleDestacado(id, estadoActual, btn) {
  btn.disabled = true;
  const nuevoEstado = !estadoActual;

  try {
    await updateDoc(doc(db, "articulos", id), { destacado: nuevoEstado });
    btn.textContent = nuevoEstado ? "★ Destacado" : "☆ Destacar";
    btn.dataset.destacado = nuevoEstado;
    if (nuevoEstado) {
      btn.classList.add("btn-destacado-activo");
    } else {
      btn.classList.remove("btn-destacado-activo");
    }
  } catch (error) {
    console.error("Error al cambiar destacado:", error);
  } finally {
    btn.disabled = false;
  }
}

// Tabs de categorías — sección 3
document.getElementById("tabs-destacados").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll("#tabs-destacados .tab").forEach(t => t.classList.remove("activo"));
  tab.classList.add("activo");
  cargarDestacados(tab.dataset.cat);
});

// ================================================
// PANEL COMPARTIDO DE EDICIÓN
// ================================================
function abrirDetalle(id, datos, modo) {
  articuloId    = id;
  articuloDatos = datos;
  document.getElementById("detalle-imagen").src           = datos.imagenURL;
  document.getElementById("editor-titulo").value          = datos.titulo;
  document.getElementById("editor-contenido").value       = datos.contenido;
  document.getElementById("detalle-categoria").textContent = datos.categoria;

  if (datos.fuente) {
    document.getElementById("detalle-fuente").href              = datos.fuente;
    document.getElementById("detalle-fuente-row").style.display = "block";
  } else {
    document.getElementById("detalle-fuente-row").style.display = "none";
  }

  document.getElementById("bloque-imagen2").style.display = datos.imagen2URL ? "block" : "none";
  if (datos.imagen2URL) document.getElementById("detalle-imagen2").src = datos.imagen2URL;

  document.getElementById("bloque-imagen3").style.display = datos.imagen3URL ? "block" : "none";
  if (datos.imagen3URL) document.getElementById("detalle-imagen3").src = datos.imagen3URL;

  // Mostrar botón correcto según modo
  const btnPublicar = document.getElementById("btn-publicar");
  const btnGuardar  = document.getElementById("btn-guardar");
  if (modo === "publicar") {
    document.getElementById("detalle-seccion-titulo").textContent = "EDITAR Y PUBLICAR";
    btnPublicar.style.display = "block";
    btnGuardar.style.display  = "none";
  } else {
    document.getElementById("detalle-seccion-titulo").textContent = "EDITAR ARTÍCULO PUBLICADO";
    btnPublicar.style.display = "none";
    btnGuardar.style.display  = "block";
  }

  document.getElementById("detalle-estado").textContent    = "";
  document.getElementById("detalle-seccion").style.display = "block";
  document.getElementById("detalle-seccion").scrollIntoView({ behavior: "smooth" });
}

// Volver
document.getElementById("btn-cerrar-detalle").addEventListener("click", () => {
  document.getElementById("detalle-seccion").style.display = "none";
  articuloId    = null;
  articuloDatos = null;
  modoEdicion   = null;
});

// Construir objeto de actualización con campos opcionales
function construirActualizacion(extras = {}) {
  const titulo    = document.getElementById("editor-titulo").value.trim();
  const contenido = document.getElementById("editor-contenido").value.trim();
  const base = {
    titulo,
    contenido,
    estado:    articuloDatos.estado,
    fecha:     articuloDatos.fecha,
    imagenURL: articuloDatos.imagenURL,
    categoria: articuloDatos.categoria,
    uid:       articuloDatos.uid,
    ...extras
  };
  if (articuloDatos.fuente)           base.fuente           = articuloDatos.fuente;
  if (articuloDatos.imagen2URL)       base.imagen2URL       = articuloDatos.imagen2URL;
  if (articuloDatos.imagen3URL)       base.imagen3URL       = articuloDatos.imagen3URL;
  if (articuloDatos.fechaPublicacion) base.fechaPublicacion = articuloDatos.fechaPublicacion;
  if (articuloDatos.destacado !== undefined) base.destacado = articuloDatos.destacado;
  return { titulo, contenido, base };
}

// PUBLICAR (borrador → publicado)
document.getElementById("btn-publicar").addEventListener("click", async () => {
  if (!articuloId) return;
  const estadoTexto = document.getElementById("detalle-estado");
  const btn         = document.getElementById("btn-publicar");

  const { titulo, contenido, base } = construirActualizacion({ fechaPublicacion: Timestamp.now() });
  if (!titulo || !contenido) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "El título y el contenido no pueden estar vacíos.";
    return;
  }

  btn.disabled            = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Publicando...";

  try {
    await updateDoc(doc(db, "articulos", articuloId), { ...base, estado: "publicado" });
    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Artículo publicado.";
    setTimeout(() => {
      document.getElementById("detalle-seccion").style.display = "none";
      cargarPendientes();
      cargarPublicados();
    }, 1200);
  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al publicar. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// GUARDAR CAMBIOS (publicado → publicado)
document.getElementById("btn-guardar").addEventListener("click", async () => {
  if (!articuloId) return;
  const estadoTexto = document.getElementById("detalle-estado");
  const btn         = document.getElementById("btn-guardar");

  const { titulo, contenido, base } = construirActualizacion();
  if (!titulo || !contenido) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "El título y el contenido no pueden estar vacíos.";
    return;
  }

  btn.disabled            = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Guardando...";

  try {
    await updateDoc(doc(db, "articulos", articuloId), base);
    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Cambios guardados.";
    setTimeout(() => {
      document.getElementById("detalle-seccion").style.display = "none";
      cargarPublicados();
    }, 1200);
  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al guardar. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});
