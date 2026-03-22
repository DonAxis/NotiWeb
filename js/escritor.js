// escritor.js — panel del escritor
import { auth, db, storage }                    from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, addDoc, query, where,
         orderBy, getDocs, Timestamp }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL }      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

// --- PROTECCIÓN DE RUTA ---
// Si el usuario no está autenticado o no es escritor, redirige al login
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarBorradores(usuario.uid);
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// --- VISTA PREVIA DE IMAGEN ---
document.getElementById("imagen").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const contenedor = document.getElementById("vista-previa-contenedor");
  const img        = document.getElementById("vista-previa");
  img.src          = URL.createObjectURL(archivo);
  contenedor.style.display = "block";
});

// --- ENVIAR BORRADOR ---
document.getElementById("form-articulo").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnEnviar   = document.getElementById("btn-enviar");
  const estadoTexto = document.getElementById("form-estado");

  const titulo    = document.getElementById("titulo").value.trim();
  const categoria = document.getElementById("categoria").value;
  const fuente    = document.getElementById("fuente").value.trim();
  const contenido = document.getElementById("contenido").value.trim();
  const archivoImagen = document.getElementById("imagen").files[0];

  if (!archivoImagen) {
    estadoTexto.textContent = "Selecciona una imagen.";
    estadoTexto.style.color = "var(--rojo)";
    return;
  }

  btnEnviar.disabled      = true;
  estadoTexto.style.color = "#555";
  estadoTexto.textContent = "Subiendo imagen...";

  try {
    // 1. Subir imagen a Firebase Storage
    const extension  = archivoImagen.name.split(".").pop();
    const nombreArchivo = `articulos/${Date.now()}.${extension}`;
    const refImagen  = ref(storage, nombreArchivo);
    await uploadBytes(refImagen, archivoImagen);
    const imagenURL  = await getDownloadURL(refImagen);

    estadoTexto.textContent = "Guardando artículo...";

    // 2. Guardar artículo en Firestore
    await addDoc(collection(db, "articulos"), {
      titulo,
      contenido,
      estado:    "borrador",
      fecha:     Timestamp.now(),
      fuente,
      imagenURL,
      categoria
    });

    estadoTexto.style.color = "green";
    estadoTexto.textContent = "Borrador enviado. El editor lo revisará pronto.";
    e.target.reset();
    document.getElementById("vista-previa-contenedor").style.display = "none";
    cargarBorradores(auth.currentUser.uid);

  } catch (error) {
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = "Error al enviar. Intenta de nuevo.";
    console.error(error);
  } finally {
    btnEnviar.disabled = false;
  }
});

// --- CARGAR BORRADORES PROPIOS ---
async function cargarBorradores(uid) {
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
      lista.innerHTML += `
        <div class="articulo-fila">
          <img src="${datos.imagenURL}" alt="${datos.titulo}" class="articulo-miniatura">
          <div class="articulo-fila-info">
            <p class="articulo-fila-titulo">${datos.titulo}</p>
            <p class="articulo-fila-meta">${datos.categoria} · ${fecha} · <span class="estado-borrador">Borrador</span></p>
          </div>
        </div>`;
    });

  } catch (error) {
    lista.innerHTML = "<p class='lista-vacia'>Error al cargar borradores.</p>";
    console.error(error);
  }
}
