// editor.js — panel del editor
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, query, where, orderBy,
         getDocs, doc, updateDoc, Timestamp }    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

let articuloSeleccionadoId = null;
let articuloSeleccionadoDatos = null;

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarBorradores();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// --- CARGAR BORRADORES ---
async function cargarBorradores() {
  const lista = document.getElementById("lista-borradores");
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

      const fila = document.createElement("div");
      fila.className = "articulo-fila articulo-fila-clickable";
      fila.innerHTML = `
        <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
        <div class="articulo-fila-info">
          <p class="articulo-fila-titulo">${datos.titulo}</p>
          <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
        </div>
        <span class="estado-borrador">Pendiente</span>`;

      fila.addEventListener("click", () => abrirDetalle(documento.id, datos));
      lista.appendChild(fila);
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar borradores.</p>";
    console.error(error);
  }
}

// --- ABRIR DETALLE ---
function abrirDetalle(id, datos) {
  articuloSeleccionadoId    = id;
  articuloSeleccionadoDatos = datos;

  document.getElementById("detalle-imagen").src         = datos.imagenURL;
  document.getElementById("detalle-categoria").textContent = datos.categoria;
  document.getElementById("detalle-titulo").textContent  = datos.titulo;
  document.getElementById("detalle-fuente").href         = datos.fuente;
  document.getElementById("detalle-contenido").textContent = datos.contenido;
  document.getElementById("detalle-estado").textContent  = "";

  document.getElementById("detalle-seccion").style.display = "block";
  document.getElementById("detalle-seccion").scrollIntoView({ behavior: "smooth" });
  document.getElementById("btn-publicar").disabled = false;
}

// --- VOLVER ---
document.getElementById("btn-cerrar-detalle").addEventListener("click", () => {
  document.getElementById("detalle-seccion").style.display = "none";
  articuloSeleccionadoId    = null;
  articuloSeleccionadoDatos = null;
});

// --- PUBLICAR ---
document.getElementById("btn-publicar").addEventListener("click", async () => {
  if (!articuloSeleccionadoId || !articuloSeleccionadoDatos) return;

  const btnPublicar  = document.getElementById("btn-publicar");
  const estadoTexto  = document.getElementById("detalle-estado");

  btnPublicar.disabled     = true;
  estadoTexto.style.color  = "#555";
  estadoTexto.textContent  = "Publicando...";

  try {
    await updateDoc(doc(db, "articulos", articuloSeleccionadoId), {
      ...articuloSeleccionadoDatos,
      estado:           "publicado",
      fechaPublicacion: Timestamp.now()
    });

    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Artículo publicado correctamente.";

    // Actualizar lista sin recargar página
    setTimeout(() => {
      document.getElementById("detalle-seccion").style.display = "none";
      cargarBorradores();
    }, 1500);

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al publicar. Intenta de nuevo.";
    btnPublicar.disabled    = false;
    console.error(error);
  }
});
