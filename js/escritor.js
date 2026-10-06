// escritor.js — panel del escritor (un artículo a la vez)
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, addDoc, updateDoc, query,
         where, limit, getDocs, getDoc,
         doc, Timestamp }                        from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const CLOUDINARY_URL    = "https://api.cloudinary.com/v1_1/diaki2vi2/image/upload";
const CLOUDINARY_PRESET = "VIGÍA CIENTÍFICO";

let uidActual   = null;
let borradoreId = null;
let modoEdicion = false;

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
  await verificarBorrador();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login.html";
});

// --- VERIFICAR BORRADOR EXISTENTE ---
// Si existe un borrador propio, precarga el formulario y activa modo edición.
// Si no hay ninguno, muestra el formulario vacío en modo creación.
async function verificarBorrador() {
  try {
    const q    = query(
      collection(db, "articulos"),
      where("estado", "==", "borrador"),
      where("uid",    "==", uidActual),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const documento = snap.docs[0];
      const datos     = documento.data();
      borradoreId     = documento.id;
      modoEdicion     = true;

      document.getElementById("titulo").value    = datos.titulo    || "";
      document.getElementById("categoria").value = datos.categoria || "";
      document.getElementById("contenido").value = datos.contenido || "";

      if (datos.imagenURL) {
        document.getElementById("vista-previa").src                      = datos.imagenURL;
        document.getElementById("vista-previa-contenedor").style.display = "block";
      }

      activarModo("edicion");
    } else {
      borradoreId = null;
      modoEdicion = false;
      activarModo("creacion");
    }
  } catch (error) {
    console.error("Error al verificar borrador:", error);
  }
}

function activarModo(modo) {
  const esEdicion = modo === "edicion";
  document.getElementById("seccion-titulo").textContent    = esEdicion ? "TU ARTÍCULO EN REVISIÓN" : "NUEVO ARTÍCULO";
  document.getElementById("btn-enviar").textContent        = esEdicion ? "Guardar cambios"          : "Enviar a revisión";
  document.getElementById("aviso-revision").style.display  = esEdicion ? "block"                   : "none";
}

// --- VISTA PREVIA DE IMAGEN ---
document.getElementById("imagen").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  document.getElementById("vista-previa").src                      = URL.createObjectURL(archivo);
  document.getElementById("vista-previa-contenedor").style.display = "block";
});

// --- HELPER: subir imagen a Cloudinary ---
async function subirImagen(archivo) {
  const formData = new FormData();
  formData.append("file",          archivo);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  const respuesta = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
  if (!respuesta.ok) throw new Error("Error al subir imagen");
  return (await respuesta.json()).secure_url;
}

// --- ENVIAR / GUARDAR ---
document.getElementById("form-articulo").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnEnviar   = document.getElementById("btn-enviar");
  const estadoTexto = document.getElementById("form-estado");

  const titulo    = document.getElementById("titulo").value.trim();
  const categoria = document.getElementById("categoria").value;
  const contenido = document.getElementById("contenido").value.trim();
  const archivo   = document.getElementById("imagen").files[0];

  if (!modoEdicion && !archivo) {
    estadoTexto.textContent = "La imagen principal es obligatoria.";
    estadoTexto.style.color = "var(--rojo)";
    return;
  }

  btnEnviar.disabled      = true;
  estadoTexto.style.color = "#555";

  try {
    if (modoEdicion) {
      const actualizacion = { titulo, categoria, contenido };

      if (archivo) {
        estadoTexto.textContent = "Subiendo imagen...";
        actualizacion.imagenURL = await subirImagen(archivo);
      }

      estadoTexto.textContent = "Guardando cambios...";
      await updateDoc(doc(db, "articulos", borradoreId), actualizacion);

      estadoTexto.style.color = "green";
      estadoTexto.textContent = "Cambios guardados.";

    } else {
      estadoTexto.textContent = "Subiendo imagen...";
      const imagenURL = await subirImagen(archivo);

      estadoTexto.textContent = "Enviando artículo...";
      const nuevoDoc = await addDoc(collection(db, "articulos"), {
        titulo,
        contenido,
        estado:    "borrador",
        fecha:     Timestamp.now(),
        imagenURL,
        categoria,
        uid:       uidActual
      });

      borradoreId = nuevoDoc.id;
      modoEdicion = true;
      activarModo("edicion");

      estadoTexto.style.color = "green";
      estadoTexto.textContent = "Artículo enviado a revisión.";
    }

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al guardar. Intenta de nuevo.";
    console.error(error);
  } finally {
    btnEnviar.disabled = false;
  }
});
