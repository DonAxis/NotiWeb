// articulos.js — carga artículos desde Firestore y maneja carrusel/tabs
import { db } from "./firebase.js";
import { collection, query, where, orderBy, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// --- ÚLTIMAS NOTICIAS (primeros 5 publicados) ---
async function cargarUltimasNoticias() {
  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      orderBy("fechaPublicacion", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);
    const articulos = [];
    snap.forEach(doc => articulos.push({ _id: doc.id, ...doc.data() }));

    if (articulos[0]) {
      const el = document.getElementById("articulo-destacado");
      el.style.backgroundImage = `url(${articulos[0].imagenURL})`;
      el.querySelector(".articulo-titulo").textContent = articulos[0].titulo;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        window.location.href = `paginas/articulo.html?id=${articulos[0]._id}`;
      });
    }

    const secundarios = document.getElementById("grid-secundario").querySelectorAll(".articulo");
    articulos.slice(1).forEach((a, i) => {
      if (!secundarios[i]) return;
      secundarios[i].style.backgroundImage = `url(${a.imagenURL})`;
      secundarios[i].querySelector(".articulo-titulo").textContent = a.titulo;
      secundarios[i].style.cursor = "pointer";
      secundarios[i].addEventListener("click", () => {
        window.location.href = `paginas/articulo.html?id=${a._id}`;
      });
    });

  } catch (error) {
    console.error("Error al cargar últimas noticias:", error);
  }
}

// --- CIENCIA Y TECNOLOGÍA (2 más recientes de tecnologia) ---
async function cargarCiencia() {
  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", "tecnologia"),
      orderBy("fechaPublicacion", "desc"),
      limit(2)
    );
    const snap = await getDocs(q);
    const articulos = [];
    snap.forEach(doc => articulos.push({ _id: doc.id, ...doc.data() }));

    const tarjetas = document.getElementById("grid-ciencia").querySelectorAll(".articulo");
    articulos.forEach((a, i) => {
      if (!tarjetas[i]) return;
      tarjetas[i].style.backgroundImage = `url(${a.imagenURL})`;
      tarjetas[i].querySelector(".articulo-titulo").textContent = a.titulo;
      tarjetas[i].style.cursor = "pointer";
      tarjetas[i].addEventListener("click", () => {
        window.location.href = `paginas/articulo.html?id=${a._id}`;
      });
    });

  } catch (error) {
    console.error("Error al cargar sección ciencia:", error);
  }
}

// --- CARRUSEL por categoría ---
async function cargarCarrusel(categoria) {
  const carrusel = document.getElementById("carrusel");
  carrusel.innerHTML = "";

  // El tab "ambiente" guarda artículos con categoría "medio-ambiente" en Firestore
  const categoriaFirestore = categoria === "ambiente" ? "medio-ambiente" : categoria;

  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", categoriaFirestore),
      where("destacado", "==", true),
      orderBy("fechaPublicacion", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      carrusel.innerHTML = "<p style='padding:1rem;color:#555'>Sin artículos en esta categoría.</p>";
      return;
    }

    snap.forEach(documento => {
      const a = { _id: documento.id, ...documento.data() };
      const tarjeta = document.createElement("div");
      tarjeta.className = "tarjeta";
      tarjeta.style.backgroundImage = `url(${a.imagenURL})`;
      tarjeta.style.cursor = "pointer";
      tarjeta.innerHTML = `<div class="articulo-overlay"><p class="articulo-titulo">${a.titulo}</p></div>`;
      tarjeta.addEventListener("click", () => {
        window.location.href = `paginas/articulo.html?id=${a._id}`;
      });
      carrusel.appendChild(tarjeta);
    });

  } catch (error) {
    console.error("Error al cargar carrusel:", error);
  }
}

// --- NAVEGACIÓN DEL CARRUSEL ---
const carruselEl = document.querySelector(".carrusel");
const btnPrev    = document.querySelector(".carrusel-prev");
const btnNext    = document.querySelector(".carrusel-next");

if (carruselEl && btnPrev && btnNext) {
  const anchoPaso = () => {
    const tarjeta = carruselEl.querySelector(".tarjeta");
    return tarjeta ? tarjeta.offsetWidth + 12 : 200;
  };
  btnNext.addEventListener("click", () => carruselEl.scrollBy({ left:  anchoPaso(), behavior: "smooth" }));
  btnPrev.addEventListener("click", () => carruselEl.scrollBy({ left: -anchoPaso(), behavior: "smooth" }));
}

// --- TABS ---
const tabs = document.querySelectorAll(".tab");
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("activo"));
    tab.classList.add("activo");
    cargarCarrusel(tab.dataset.categoria);
  });
});

// --- SECCIÓN MUNDO: cargar artículos por continente ---
async function cargarArticulosMundo(continente) {
  const contenedor = document.getElementById("mundo-articulos");
  contenedor.innerHTML = "<p class='mundo-vacio'>Cargando...</p>";

  try {
    const q = query(
      collection(db, "articulos"),
      where("estado",     "==", "publicado"),
      where("categoria",  "==", "mundo"),
      where("continente", "==", continente),
      orderBy("fechaPublicacion", "desc"),
      limit(9)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      contenedor.innerHTML = "<p class='mundo-vacio'>Sin artículos en este continente por ahora.</p>";
      return;
    }

    contenedor.innerHTML = "";
    snap.forEach(documento => {
      const a = { _id: documento.id, ...documento.data() };
      const tarjeta = document.createElement("article");
      tarjeta.className = "articulo mundo-tarjeta";
      tarjeta.style.backgroundImage = `url(${a.imagenURL})`;
      tarjeta.innerHTML = `<div class="articulo-overlay"><p class="articulo-titulo">${a.titulo}</p></div>`;
      tarjeta.addEventListener("click", () => {
        window.location.href = `paginas/articulo.html?id=${a._id}`;
      });
      contenedor.appendChild(tarjeta);
    });

  } catch (error) {
    contenedor.innerHTML = "<p class='mundo-vacio'>Error al cargar artículos.</p>";
    console.error(error);
  }
}

// --- MAPA MUNDIAL: eventos de continentes ---
const continentes = document.querySelectorAll(".continente");
const panelMundo  = document.getElementById("mundo-panel");
const tituloCont  = document.getElementById("mundo-titulo-continente");
let continenteActivo = null;

continentes.forEach(g => {
  const activar = () => {
    const valor  = g.dataset.continente;
    const nombre = g.dataset.nombre;

    if (continenteActivo) continenteActivo.classList.remove("activo");

    if (continenteActivo === g) {
      // segundo clic: cerrar panel
      panelMundo.style.display = "none";
      continenteActivo = null;
      return;
    }

    g.classList.add("activo");
    continenteActivo = g;
    tituloCont.textContent = nombre;
    panelMundo.style.display = "block";
    cargarArticulosMundo(valor);
    panelMundo.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  g.addEventListener("click", activar);
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activar(); }
  });
});

document.getElementById("mundo-cerrar").addEventListener("click", () => {
  panelMundo.style.display = "none";
  if (continenteActivo) { continenteActivo.classList.remove("activo"); continenteActivo = null; }
});

// --- INICIALIZAR ---
const tabActivo = document.querySelector(".tab.activo");
cargarUltimasNoticias();
cargarCiencia();
cargarCarrusel(tabActivo ? tabActivo.dataset.categoria : "investigacion");
