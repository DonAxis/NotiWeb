// editor.js — panel del editor (solo aprobar + gestionar destacados)
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, doc, updateDoc, getDocs,
         getDoc, query, where, orderBy,
         limit, Timestamp }                      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Máx. artículos destacados por categoría (FIFO: el más antiguo se retira al superar el límite)
const MAX_DESTACADOS = 5;

let articuloActual = null; // { id, datos, modo }

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
  cargarPendientes();
  cargarPublicados("noticias");
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login.html";
});

// --- CARGAR PENDIENTES (borradores) ---
async function cargarPendientes() {
  const lista = document.getElementById("lista-pendientes");
  lista.innerHTML = "<p class='lista-vacia'>Cargando...</p>";

  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "borrador"),
      orderBy("fecha", "desc")
    ));

    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>Sin borradores pendientes.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach(documento => {
      const datos = documento.data();
      const fecha = datos.fecha?.toDate().toLocaleDateString("es-MX") ?? "—";
      lista.appendChild(crearFila(documento.id, datos, fecha, "borrador"));
    });
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// --- CARGAR PUBLICADOS (por categoría) ---
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

    if (snap.empty) {
      lista.innerHTML = "<p class='lista-vacia'>Sin artículos publicados en esta categoría.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach(documento => {
      const datos = documento.data();
      const fecha = datos.fechaPublicacion?.toDate().toLocaleDateString("es-MX") ?? "—";
      lista.appendChild(crearFila(documento.id, datos, fecha, "publicado"));
    });
  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar.</p>";
    console.error(error);
  }
}

// --- CREAR FILA DE ARTÍCULO ---
function crearFila(id, datos, fecha, modo) {
  const fila = document.createElement("div");
  fila.className = "articulo-fila articulo-fila-clickable";

  const badgeEstado = modo === "borrador"
    ? `<span class="estado-borrador">Pendiente</span>`
    : `<span class="estado-publicado">Publicado</span>`;

  const btnDestHTML = modo === "publicado" ? `
    <button class="btn-destacado ${datos.destacado ? "btn-destacado-activo" : ""}" data-id="${id}">
      ${datos.destacado ? "★ Destacado" : "☆ Destacar"}
    </button>` : "";

  fila.innerHTML = `
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
    <div class="articulo-fila-info">
      <p class="articulo-fila-titulo">${datos.titulo}</p>
      <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
    </div>
    ${badgeEstado}
    ${btnDestHTML}`;

  fila.addEventListener("click", (e) => {
    if (e.target.closest(".btn-destacado")) return;
    abrirVista(id, datos, modo);
  });

  const btnDest = fila.querySelector(".btn-destacado");
  if (btnDest) {
    btnDest.addEventListener("click", async (e) => {
      e.stopPropagation();
      btnDest.disabled = true;
      await toggleDestacadoConLimite(id, datos);
      // Recargar lista para reflejar cambios (incluyendo artículo desplazado por FIFO)
      const tabActivo = document.querySelector("#tabs-publicados .tab.activo");
      await cargarPublicados(tabActivo ? tabActivo.dataset.cat : "noticias");
    });
  }

  return fila;
}

// --- ABRIR VISTA DE ARTÍCULO (render igual a articulo.html) ---
function abrirVista(id, datos, modo) {
  articuloActual = { id, datos, modo };

  const parrafos = (datos.contenido || "").split("\n\n");
  const mitad    = Math.ceil(parrafos.length / 2);
  const parte1   = parrafos.slice(0, mitad).join("\n\n");
  const parte2   = parrafos.slice(mitad).join("\n\n");

  const img2 = datos.imagen2URL
    ? `<img src="${datos.imagen2URL}" alt="" class="art-imagen-extra">` : "";
  const img3 = datos.imagen3URL
    ? `<img src="${datos.imagen3URL}" alt="" class="art-imagen-extra">` : "";

  const fechaTexto = modo === "publicado" && datos.fechaPublicacion
    ? datos.fechaPublicacion.toDate().toLocaleDateString("es-MX", {
        year: "numeric", month: "long", day: "numeric"
      })
    : "Borrador — sin publicar";

  document.getElementById("vista-articulo").innerHTML = `
    <p class="art-categoria">${datos.categoria}</p>
    <h1 class="art-titulo">${datos.titulo}</h1>
    <p class="art-meta">${fechaTexto}</p>
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="art-imagen-principal">
    <div class="art-contenido">${parte1}</div>
    ${img2}
    <div class="art-contenido">${parte2}</div>
    ${img3}`;

  const btnAprobar  = document.getElementById("btn-aprobar");
  const btnDestacar = document.getElementById("btn-destacar");

  document.getElementById("vista-estado").textContent = "";
  btnAprobar.style.display  = modo === "borrador"  ? "inline-block" : "none";
  btnDestacar.style.display = modo === "publicado" ? "inline-block" : "none";
  btnAprobar.disabled       = false;

  if (modo === "publicado") {
    btnDestacar.textContent = datos.destacado ? "★ Quitar destacado" : "☆ Destacar";
    btnDestacar.className   = `btn-destacado ${datos.destacado ? "btn-destacado-activo" : ""}`;
  }

  document.getElementById("panel-lista").style.display = "none";
  document.getElementById("panel-vista").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- VOLVER AL PANEL LISTA ---
document.getElementById("btn-volver").addEventListener("click", () => {
  document.getElementById("panel-vista").style.display = "none";
  document.getElementById("panel-lista").style.display = "block";
  articuloActual = null;
});

// --- APROBAR ARTÍCULO ---
document.getElementById("btn-aprobar").addEventListener("click", async () => {
  if (!articuloActual) return;
  const { id } = articuloActual;
  const btn    = document.getElementById("btn-aprobar");
  const estado = document.getElementById("vista-estado");

  btn.disabled       = true;
  estado.style.color = "#555";
  estado.textContent = "Publicando...";

  try {
    await updateDoc(doc(db, "articulos", id), {
      estado:           "publicado",
      fechaPublicacion: Timestamp.now()
    });

    estado.style.color = "green";
    estado.textContent = "¡Artículo publicado!";

    setTimeout(() => {
      document.getElementById("panel-vista").style.display = "none";
      document.getElementById("panel-lista").style.display = "block";
      articuloActual = null;
      cargarPendientes();
      const tabActivo = document.querySelector("#tabs-publicados .tab.activo");
      cargarPublicados(tabActivo ? tabActivo.dataset.cat : "noticias");
    }, 800);

  } catch (error) {
    estado.style.color = "var(--rojo)";
    estado.textContent = "Error al publicar. Intenta de nuevo.";
    btn.disabled = false;
    console.error(error);
  }
});

// --- DESTACAR DESDE EL PANEL VISTA ---
document.getElementById("btn-destacar").addEventListener("click", async () => {
  if (!articuloActual || articuloActual.modo !== "publicado") return;
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

// --- TOGGLE DESTACADO CON LÍMITE FIFO POR CATEGORÍA ---
async function toggleDestacadoConLimite(id, datos) {
  const nuevoEstado = !datos.destacado;

  if (nuevoEstado) {
    // Buscar destacados existentes de esta categoría, ordenados del más antiguo al más nuevo
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado",         "==", "publicado"),
      where("categoria",      "==", datos.categoria),
      where("destacado",      "==", true),
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

// --- TABS DE PUBLICADOS ---
document.querySelectorAll("#tabs-publicados .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#tabs-publicados .tab").forEach(t => t.classList.remove("activo"));
    tab.classList.add("activo");
    cargarPublicados(tab.dataset.cat);
  });
});
