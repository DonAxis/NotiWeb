// escritor.js — panel del escritor (múltiples estados, Firebase Storage)
import { auth, db, storage }                         from "./firebase.js";
import { onAuthStateChanged, signOut }               from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, addDoc, updateDoc, query,
         where, getDocs, getDoc,
         doc, Timestamp }                            from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL }          from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

// Reglas de Firebase Storage requeridas en la consola:
// match /articulos/{uid}/{allPaths=**} {
//   allow write: if request.auth != null && request.auth.uid == uid;
//   allow read:  if true;
// }

const LIMITE_PORTADA = 1 * 1024 * 1024; // 1 MB
const LIMITE_DOC     = 2 * 1024 * 1024; // 2 MB
const MIN_W = 600, MIN_H = 400;

const SUBCATEGORIAS = {
  informatica: ["hardware", "software", "redes", "ia", "ciberseguridad"],
  gastronomia: ["recetas", "cultura", "restaurantes", "tendencias"],
  ocio:        ["cine", "musica", "videojuegos", "libros"],
};

let uidActual         = null;
let articuloEnEdicion = null; // null = nuevo · { id, datos, estado } = edición

// --- LÓGICA DE SUBCATEGORÍA / CONTINENTE ---
function actualizarCamposSecundarios(categoria, valorSub = "", valorCont = "") {
  const campoCont = document.getElementById("campo-continente");
  const campoSub  = document.getElementById("campo-subcategoria");
  const selSub    = document.getElementById("subcategoria");
  const selCont   = document.getElementById("continente");

  if (categoria === "mundo") {
    campoCont.style.display = "block";
    campoSub.style.display  = "none";
    selCont.required = true;
    selSub.required  = false;
    selCont.value = valorCont;
  } else if (SUBCATEGORIAS[categoria]) {
    campoCont.style.display = "none";
    campoSub.style.display  = "block";
    selCont.required = false;
    selSub.required  = true;
    selSub.innerHTML = `<option value="">Selecciona una subcategoría</option>` +
      SUBCATEGORIAS[categoria].map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
    selSub.value = valorSub;
  } else {
    campoCont.style.display = "none";
    campoSub.style.display  = "none";
    selCont.required = false;
    selSub.required  = false;
  }
}

document.getElementById("categoria").addEventListener("change", (e) => {
  actualizarCamposSecundarios(e.target.value);
});

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "../login.html";
    return;
  }

  const snap = await getDoc(doc(db, "usuarios", usuario.uid));
  const rol  = snap.exists() ? snap.data().rol : null;

  if (rol === "editor") {
    window.location.href = "../editor/index.html";
    return;
  }
  if (rol !== "escritor") {
    window.location.href = "../login.html";
    return;
  }

  uidActual = usuario.uid;
  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarArticulos();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login.html";
});

// --- CARGAR TODOS LOS ARTÍCULOS DEL ESCRITOR ---
async function cargarArticulos() {
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("uid", "==", uidActual)
    ));

    const rechazados = [];
    const borradores = [];
    const historial  = [];

    snap.forEach(d => {
      const datos  = d.data();
      switch (datos.estado) {
        case "rechazado": rechazados.push({ id: d.id, datos }); break;
        case "borrador":  borradores.push({ id: d.id, datos }); break;
        default:          historial.push({ id: d.id, datos });  break;
      }
    });

    // Rechazados (sección prominente)
    const secRech   = document.getElementById("seccion-rechazados");
    const listaRech = document.getElementById("lista-rechazados");
    if (rechazados.length > 0) {
      listaRech.innerHTML = "";
      rechazados.forEach(({ id, datos }) => listaRech.appendChild(crearFila(id, datos)));
      secRech.style.display = "block";
    } else {
      secRech.style.display = "none";
    }

    // Borradores (en revisión)
    const listaBorr = document.getElementById("lista-borrador");
    if (borradores.length > 0) {
      listaBorr.innerHTML = "";
      borradores.forEach(({ id, datos }) => listaBorr.appendChild(crearFila(id, datos)));
    } else {
      listaBorr.innerHTML = "<p class='lista-vacia'>Sin artículos en revisión.</p>";
    }

    // Historial (aceptados y publicados, solo lectura)
    const secHist   = document.getElementById("seccion-historial");
    const listaHist = document.getElementById("lista-historial");
    if (historial.length > 0) {
      listaHist.innerHTML = "";
      historial.forEach(({ id, datos }) => listaHist.appendChild(crearFila(id, datos)));
      secHist.style.display = "block";
    } else {
      secHist.style.display = "none";
    }

  } catch (error) {
    console.error("Error al cargar artículos:", error);
  }
}

// --- CREAR FILA DEL ESCRITOR ---
function crearFila(id, datos) {
  const estado = datos.estado;
  const fecha  = (datos.fechaPublicacion ?? datos.fechaAceptado ?? datos.fecha)
    ?.toDate().toLocaleDateString("es-MX") ?? "—";

  const badges = {
    borrador:  `<span class="estado-borrador">En revisión</span>`,
    aceptado:  `<span class="estado-aceptado">Aceptado</span>`,
    publicado: `<span class="estado-publicado">Publicado</span>`,
    rechazado: `<span class="estado-rechazado">Rechazado</span>`,
  };

  const fila = document.createElement("div");
  fila.className = "articulo-fila";

  const motivoHtml = estado === "rechazado" && datos.motivoRechazo
    ? `<p class="motivo-rechazo-texto">"${datos.motivoRechazo}"</p>` : "";

  const editable = estado === "borrador" || estado === "rechazado";
  const btnLabel = estado === "rechazado" ? "Editar y reenviar" : "Editar";

  const btnHTML = editable
    ? `<button class="btn-secundario" style="flex-shrink:0; padding:6px 14px; font-size:0.8rem;">${btnLabel}</button>`
    : "";

  fila.innerHTML = `
    <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
    <div class="articulo-fila-info">
      <p class="articulo-fila-titulo">${datos.titulo}</p>
      <p class="articulo-fila-meta">${datos.categoria} · ${fecha}</p>
      ${motivoHtml}
    </div>
    ${badges[estado] ?? ""}
    ${btnHTML}`;

  const btn = fila.querySelector(".btn-secundario");
  if (btn) btn.addEventListener("click", () => abrirFormEdicion(id, datos));

  return fila;
}

// --- ABRIR FORMULARIO EN MODO EDICIÓN ---
function abrirFormEdicion(id, datos) {
  articuloEnEdicion = { id, datos, estado: datos.estado };

  document.getElementById("titulo").value    = datos.titulo    || "";
  document.getElementById("categoria").value = datos.categoria || "";
  document.getElementById("contenido").value = datos.contenido || "";
  document.getElementById("error-imagen").style.display = "none";
  actualizarCamposSecundarios(datos.categoria || "", datos.subcategoria || "", datos.continente || "");

  if (datos.imagenURL) {
    document.getElementById("vista-previa").src                      = datos.imagenURL;
    document.getElementById("vista-previa-contenedor").style.display = "block";
  } else {
    document.getElementById("vista-previa-contenedor").style.display = "none";
  }

  if (datos.imagen2URL) {
    document.getElementById("vista-previa2").src                      = datos.imagen2URL;
    document.getElementById("vista-previa2-contenedor").style.display = "block";
  } else {
    document.getElementById("vista-previa2-contenedor").style.display = "none";
  }

  const esRechazado = datos.estado === "rechazado";
  document.getElementById("aviso-rechazo").style.display  = esRechazado ? "block" : "none";
  document.getElementById("aviso-revision").style.display = esRechazado ? "none"  : "block";

  if (esRechazado && datos.motivoRechazo) {
    document.getElementById("texto-motivo").textContent = datos.motivoRechazo;
  }

  document.getElementById("titulo-form").textContent = esRechazado ? "EDITAR Y REENVIAR" : "EDITAR ARTÍCULO";
  document.getElementById("btn-enviar").textContent  = esRechazado ? "Reenviar a revisión" : "Guardar cambios";
  document.getElementById("form-estado").textContent = "";

  mostrarPanelForm();
}

// --- ABRIR FORMULARIO EN MODO CREACIÓN ---
document.getElementById("btn-nuevo-articulo").addEventListener("click", () => {
  articuloEnEdicion = null;

  document.getElementById("form-articulo").reset();
  document.getElementById("vista-previa-contenedor").style.display  = "none";
  document.getElementById("vista-previa2-contenedor").style.display = "none";
  document.getElementById("aviso-rechazo").style.display            = "none";
  document.getElementById("aviso-revision").style.display           = "none";
  document.getElementById("error-imagen").style.display             = "none";
  document.getElementById("error-imagen2").style.display            = "none";
  actualizarCamposSecundarios("");
  document.getElementById("titulo-form").textContent               = "NUEVO ARTÍCULO";
  document.getElementById("btn-enviar").textContent                = "Enviar a revisión";
  document.getElementById("form-estado").textContent               = "";

  mostrarPanelForm();
});

function mostrarPanelForm() {
  document.getElementById("panel-lista").style.display = "none";
  document.getElementById("panel-form").style.display  = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- CANCELAR Y VOLVER ---
document.getElementById("btn-cancelar-form").addEventListener("click", () => {
  document.getElementById("panel-form").style.display  = "none";
  document.getElementById("panel-lista").style.display = "block";
  articuloEnEdicion = null;
});

// --- VALIDACIÓN DE IMAGEN ---
// limite: en bytes · checkDims: true solo para portada
async function validarImagen(archivo, limite, checkDims = false) {
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

// --- VISTA PREVIA CON VALIDACIÓN ---
async function manejarCambioImagen(e, limite, checkDims, idError, idPrevia, idPreviaCont) {
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

document.getElementById("imagen").addEventListener("change", (e) =>
  manejarCambioImagen(e, LIMITE_PORTADA, true, "error-imagen", "vista-previa", "vista-previa-contenedor")
);

document.getElementById("imagen2").addEventListener("change", (e) =>
  manejarCambioImagen(e, LIMITE_DOC, false, "error-imagen2", "vista-previa2", "vista-previa2-contenedor")
);

// --- SUBIR IMAGEN A FIREBASE STORAGE ---
async function subirImagen(archivo) {
  const ruta       = `articulos/${uidActual}/${Date.now()}_${archivo.name}`;
  const storageRef = ref(storage, ruta);
  await uploadBytes(storageRef, archivo);
  return getDownloadURL(storageRef);
}

// --- ENVIAR / GUARDAR ---
document.getElementById("form-articulo").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnEnviar   = document.getElementById("btn-enviar");
  const estadoTexto = document.getElementById("form-estado");
  const errImagen   = document.getElementById("error-imagen");

  const titulo       = document.getElementById("titulo").value.trim();
  const categoria    = document.getElementById("categoria").value;
  const subcategoria = document.getElementById("subcategoria").value || null;
  const continente   = document.getElementById("continente").value   || null;
  const contenido    = document.getElementById("contenido").value.trim();
  const archivo      = document.getElementById("imagen").files[0];
  const archivo2     = document.getElementById("imagen2").files[0];
  const errImagen2   = document.getElementById("error-imagen2");

  // Portada obligatoria en modo creación
  if (!articuloEnEdicion && !archivo) {
    errImagen.textContent   = "La imagen de portada es obligatoria.";
    errImagen.style.display = "block";
    return;
  }

  // Validar portada nueva si existe
  if (archivo) {
    const error = await validarImagen(archivo, LIMITE_PORTADA, true);
    if (error) {
      errImagen.textContent   = error;
      errImagen.style.display = "block";
      return;
    }
    errImagen.style.display = "none";
  }

  // Validar imagen del artículo si existe
  if (archivo2) {
    const error = await validarImagen(archivo2, LIMITE_DOC, false);
    if (error) {
      errImagen2.textContent   = error;
      errImagen2.style.display = "block";
      return;
    }
    errImagen2.style.display = "none";
  }

  btnEnviar.disabled      = true;
  estadoTexto.style.color = "#555";

  try {
    let imagenURL  = articuloEnEdicion?.datos?.imagenURL  ?? null;
    let imagen2URL = articuloEnEdicion?.datos?.imagen2URL ?? null;

    if (archivo) {
      estadoTexto.textContent = "Subiendo portada...";
      imagenURL = await subirImagen(archivo);
    }
    if (archivo2) {
      estadoTexto.textContent = "Subiendo imagen del artículo...";
      imagen2URL = await subirImagen(archivo2);
    }

    if (!articuloEnEdicion) {
      // MODO CREACIÓN
      estadoTexto.textContent = "Enviando artículo...";
      await addDoc(collection(db, "articulos"), {
        titulo,
        contenido,
        estado:      "borrador",
        fecha:       Timestamp.now(),
        imagenURL,
        imagen2URL,
        categoria,
        subcategoria,
        continente,
        uid:         uidActual
      });

      estadoTexto.style.color = "green";
      estadoTexto.textContent = "Artículo enviado a revisión.";

    } else {
      // MODO EDICIÓN (borrador o rechazado)
      const esRechazado = articuloEnEdicion.estado === "rechazado";
      const actualizacion = {
        titulo,
        categoria,
        subcategoria,
        continente,
        contenido,
        estado: "borrador",
        ...(archivo  ? { imagenURL }  : {}),
        ...(archivo2 ? { imagen2URL } : {})
      };

      if (esRechazado) {
        actualizacion.motivoRechazo  = null;
        actualizacion.fechaRechazado = null;
        actualizacion.fecha          = Timestamp.now();
      }

      estadoTexto.textContent = "Guardando cambios...";
      await updateDoc(doc(db, "articulos", articuloEnEdicion.id), actualizacion);

      estadoTexto.style.color = "green";
      estadoTexto.textContent = esRechazado ? "Artículo reenviado a revisión." : "Cambios guardados.";
    }

    // Volver al panel después de un momento
    setTimeout(async () => {
      document.getElementById("panel-form").style.display  = "none";
      document.getElementById("panel-lista").style.display = "block";
      articuloEnEdicion = null;
      document.getElementById("lista-borrador").innerHTML = "<p class='lista-vacia'>Cargando...</p>";
      await cargarArticulos();
    }, 1200);

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al guardar. Intenta de nuevo.";
    console.error(error);
  } finally {
    btnEnviar.disabled = false;
  }
});
