// escritor.js — panel del escritor
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, addDoc, query, where,
         orderBy, getDocs, getDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const CLOUDINARY_URL    = "https://api.cloudinary.com/v1_1/diaki2vi2/image/upload";
const CLOUDINARY_PRESET = "VIGÍA CIENTÍFICO";

// --- PROTECCIÓN DE RUTA ---
let uidActual = null;

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
  cargarBorradores();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login.html";
});

// --- VISTA PREVIA DE IMAGEN ---
document.getElementById("imagen").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  document.getElementById("vista-previa").src = URL.createObjectURL(archivo);
  document.getElementById("vista-previa-contenedor").style.display = "block";
});

// --- MOSTRAR/OCULTAR SELECTOR DE CONTINENTE ---
document.getElementById("categoria").addEventListener("change", (e) => {
  const campoContinente = document.getElementById("campo-continente");
  const selectContinente = document.getElementById("continente");
  if (e.target.value === "mundo") {
    campoContinente.style.display = "block";
    selectContinente.required = true;
  } else {
    campoContinente.style.display = "none";
    selectContinente.required = false;
    selectContinente.value = "";
  }
});

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

  const titulo     = document.getElementById("titulo").value.trim();
  const categoria  = document.getElementById("categoria").value;
  const continente = document.getElementById("continente").value;
  const contenido  = document.getElementById("contenido").value.trim();
  const archivo    = document.getElementById("imagen").files[0];

  if (!archivo) {
    estadoTexto.textContent = "La imagen principal es obligatoria.";
    estadoTexto.style.color = "var(--rojo)";
    return;
  }

  if (categoria === "mundo" && !continente) {
    estadoTexto.textContent = "Selecciona el continente.";
    estadoTexto.style.color = "var(--rojo)";
    return;
  }

  btnEnviar.disabled      = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Subiendo imagen...";

  try {
    const imagenURL = await subirImagen(archivo);

    estadoTexto.textContent = "Guardando artículo...";

    const articulo = {
      titulo,
      contenido,
      estado:    "borrador",
      fecha:     Timestamp.now(),
      imagenURL,
      categoria,
      uid:       uidActual
    };
    if (continente) articulo.continente = continente;

    await addDoc(collection(db, "articulos"), articulo);

    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Borrador enviado. El editor lo revisará pronto.";
    e.target.reset();
    document.getElementById("vista-previa-contenedor").style.display = "none";
    document.getElementById("campo-continente").style.display = "none";
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
      where("uid", "==", uidActual),
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
