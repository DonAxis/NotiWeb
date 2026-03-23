// editor.js — panel del editor
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, query, where, orderBy,
         getDocs, doc, updateDoc, Timestamp }    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

let articuloId    = null;
let articuloDatos = null;

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
  articuloId    = id;
  articuloDatos = datos;

  // Imagen principal
  document.getElementById("detalle-imagen").src = datos.imagenURL;

  // Campos editables
  document.getElementById("editor-titulo").value    = datos.titulo;
  document.getElementById("editor-contenido").value = datos.contenido;

  // Meta (solo lectura)
  document.getElementById("detalle-categoria").textContent = datos.categoria;
  if (datos.fuente) {
    document.getElementById("detalle-fuente").href          = datos.fuente;
    document.getElementById("detalle-fuente-row").style.display = "block";
  } else {
    document.getElementById("detalle-fuente-row").style.display = "none";
  }

  // Imagen 2 (opcional)
  if (datos.imagen2URL) {
    document.getElementById("detalle-imagen2").src      = datos.imagen2URL;
    document.getElementById("bloque-imagen2").style.display = "block";
  } else {
    document.getElementById("bloque-imagen2").style.display = "none";
  }

  // Imagen 3 (opcional)
  if (datos.imagen3URL) {
    document.getElementById("detalle-imagen3").src      = datos.imagen3URL;
    document.getElementById("bloque-imagen3").style.display = "block";
  } else {
    document.getElementById("bloque-imagen3").style.display = "none";
  }

  document.getElementById("detalle-estado").textContent  = "";
  document.getElementById("btn-publicar").disabled       = false;
  document.getElementById("detalle-seccion").style.display = "block";
  document.getElementById("detalle-seccion").scrollIntoView({ behavior: "smooth" });
}

// --- VOLVER ---
document.getElementById("btn-cerrar-detalle").addEventListener("click", () => {
  document.getElementById("detalle-seccion").style.display = "none";
  articuloId    = null;
  articuloDatos = null;
});

// --- PUBLICAR ---
document.getElementById("btn-publicar").addEventListener("click", async () => {
  if (!articuloId || !articuloDatos) return;

  const btnPublicar = document.getElementById("btn-publicar");
  const estadoTexto = document.getElementById("detalle-estado");

  const tituloEditado    = document.getElementById("editor-titulo").value.trim();
  const contenidoEditado = document.getElementById("editor-contenido").value.trim();

  if (!tituloEditado || !contenidoEditado) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "El título y el contenido no pueden estar vacíos.";
    return;
  }

  btnPublicar.disabled    = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Publicando...";

  try {
    // Construir el documento final con campos obligatorios
    const actualizacion = {
      titulo:           tituloEditado,
      contenido:        contenidoEditado,
      estado:           "publicado",
      fecha:            articuloDatos.fecha,
      imagenURL:        articuloDatos.imagenURL,
      categoria:        articuloDatos.categoria,
      fechaPublicacion: Timestamp.now()
    };

    // Incluir campos opcionales si existían en el borrador original
    if (articuloDatos.fuente)     actualizacion.fuente     = articuloDatos.fuente;
    if (articuloDatos.imagen2URL) actualizacion.imagen2URL = articuloDatos.imagen2URL;
    if (articuloDatos.imagen3URL) actualizacion.imagen3URL = articuloDatos.imagen3URL;

    await updateDoc(doc(db, "articulos", articuloId), actualizacion);

    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Artículo publicado correctamente.";

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
