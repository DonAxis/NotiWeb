// escritor.js — panel del escritor
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, addDoc, query, where,
         orderBy, getDocs, Timestamp }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const CLOUDINARY_URL    = "https://api.cloudinary.com/v1_1/diaki2vi2/image/upload";
const CLOUDINARY_PRESET = "VIGÍA CIENTÍFICO";

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "../paginas/login.html";
    return;
  }
  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarBorradores();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../paginas/login.html";
});

// --- VISTA PREVIA DE IMÁGENES ---
function agregarVistaPrevia(inputId, imgId, contenedorId) {
  document.getElementById(inputId).addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    document.getElementById(imgId).src = URL.createObjectURL(archivo);
    document.getElementById(contenedorId).style.display = "block";
  });
}
agregarVistaPrevia("imagen",  "vista-previa",  "vista-previa-contenedor");
agregarVistaPrevia("imagen2", "vista-previa2", "vista-previa2-contenedor");
agregarVistaPrevia("imagen3", "vista-previa3", "vista-previa3-contenedor");

// --- HELPER: subir imagen a Cloudinary ---
async function subirImagen(archivo) {
  const formData = new FormData();
  formData.append("file",          archivo);
  formData.append("upload_preset", CLOUDINARY_PRESET);
  const respuesta = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
  if (!respuesta.ok) throw new Error("Error al subir imagen");
  const datos = await respuesta.json();
  return datos.secure_url;
}

// --- ENVIAR BORRADOR ---
document.getElementById("form-articulo").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnEnviar   = document.getElementById("btn-enviar");
  const estadoTexto = document.getElementById("form-estado");

  const titulo    = document.getElementById("titulo").value.trim();
  const categoria = document.getElementById("categoria").value;
  const fuente    = document.getElementById("fuente").value.trim();
  const contenido = document.getElementById("contenido").value.trim();
  const archivo1  = document.getElementById("imagen").files[0];
  const archivo2  = document.getElementById("imagen2").files[0];
  const archivo3  = document.getElementById("imagen3").files[0];

  if (!archivo1) {
    estadoTexto.textContent = "La imagen principal es obligatoria.";
    estadoTexto.style.color = "var(--rojo)";
    return;
  }

  btnEnviar.disabled      = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Subiendo imagen principal...";

  try {
    const imagenURL = await subirImagen(archivo1);

    let imagen2URL = null;
    if (archivo2) {
      estadoTexto.textContent = "Subiendo imagen 2...";
      imagen2URL = await subirImagen(archivo2);
    }

    let imagen3URL = null;
    if (archivo3) {
      estadoTexto.textContent = "Subiendo imagen 3...";
      imagen3URL = await subirImagen(archivo3);
    }

    estadoTexto.textContent = "Guardando artículo...";

    // Construir documento — solo incluir campos opcionales si tienen valor
    const articulo = {
      titulo,
      contenido,
      estado:    "borrador",
      fecha:     Timestamp.now(),
      imagenURL,
      categoria
    };
    if (fuente)     articulo.fuente     = fuente;
    if (imagen2URL) articulo.imagen2URL = imagen2URL;
    if (imagen3URL) articulo.imagen3URL = imagen3URL;

    await addDoc(collection(db, "articulos"), articulo);

    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Borrador enviado. El editor lo revisará pronto.";
    e.target.reset();
    ["vista-previa-contenedor","vista-previa2-contenedor","vista-previa3-contenedor"]
      .forEach(id => document.getElementById(id).style.display = "none");
    cargarBorradores();

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al enviar. Intenta de nuevo.";
    console.error(error);
  } finally {
    btnEnviar.disabled = false;
  }
});

// --- CARGAR BORRADORES PROPIOS ---
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
      lista.innerHTML = "<p class='lista-vacia'>Aún no has enviado borradores.</p>";
      return;
    }

    lista.innerHTML = "";
    snap.forEach((doc) => {
      const datos = doc.data();
      const fecha = datos.fecha?.toDate().toLocaleDateString("es-MX") ?? "—";
      const extras = [datos.imagen2URL, datos.imagen3URL].filter(Boolean).length;
      lista.innerHTML += `
        <div class="articulo-fila">
          <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
          <div class="articulo-fila-info">
            <p class="articulo-fila-titulo">${datos.titulo}</p>
            <p class="articulo-fila-meta">${datos.categoria} · ${fecha} · ${1 + extras} imagen(es) · <span class="estado-borrador">Borrador</span></p>
          </div>
        </div>`;
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar borradores.</p>";
    console.error(error);
  }
}
