// articulos.js — carga artículos desde Firestore y maneja carrusel/tabs
import { db } from "./firebase.js";
import { collection, query, where, orderBy, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { escaparHTML } from "./utilidades.js";

// style.backgroundImage no decodifica entidades HTML: aquí la URL va cruda, solo http(s) y sin comillas
const fondo = (url) => {
  const u = String(url ?? "").trim();
  return /^https?:\/\//i.test(u) && !/["\\\n]/.test(u) ? `url("${u}")` : "";
};

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
      el.style.backgroundImage = fondo(articulos[0].imagenURL);
      el.querySelector(".articulo-titulo").textContent = articulos[0].titulo;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        window.location.href = `articulo.html?id=${articulos[0]._id}`;
      });
    }

    const secundarios = document.getElementById("grid-secundario").querySelectorAll(".articulo");
    secundarios.forEach((t, i) => { if (i >= articulos.length - 1) t.style.display = "none"; });
    articulos.slice(1).forEach((a, i) => {
      if (!secundarios[i]) return;
      secundarios[i].style.backgroundImage = fondo(a.imagenURL);
      secundarios[i].querySelector(".articulo-titulo").textContent = a.titulo;
      secundarios[i].style.cursor = "pointer";
      secundarios[i].addEventListener("click", () => {
        window.location.href = `articulo.html?id=${a._id}`;
      });
    });

  } catch (error) {
    console.error("Error al cargar últimas noticias:", error);
  }
}

// --- VIDA ESTUDIANTIL (3 más recientes) ---
async function cargarVidaEstudiantil() {
  try {
    const q = query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", "vida_estudiantil"),
      orderBy("fechaPublicacion", "desc"),
      limit(3)
    );
    const snap = await getDocs(q);
    const articulos = [];
    snap.forEach(doc => articulos.push({ _id: doc.id, ...doc.data() }));

    const grid     = document.getElementById("grid-vida");
    const tarjetas = grid.querySelectorAll(".articulo");

    if (articulos.length === 0) {
      grid.style.display = "block";
      grid.style.height  = "auto";
      grid.innerHTML = "<p class='mundo-vacio' style='height:auto; padding:24px 0;'>Próximamente publicaciones de vida estudiantil.</p>";
      return;
    }
    tarjetas.forEach((t, i) => { if (i >= articulos.length) t.style.display = "none"; });

    articulos.forEach((a, i) => {
      if (!tarjetas[i]) return;
      tarjetas[i].style.backgroundImage = fondo(a.imagenURL);
      tarjetas[i].querySelector(".articulo-titulo").textContent = a.titulo;
      tarjetas[i].style.cursor = "pointer";
      tarjetas[i].addEventListener("click", () => {
        window.location.href = `articulo.html?id=${a._id}`;
      });
    });

  } catch (error) {
    console.error("Error al cargar vida estudiantil:", error);
  }
}

// --- CARRUSEL por categoría ---
let peticionCarrusel = 0;

async function cargarCarrusel(categoria) {
  const carrusel = document.getElementById("carrusel");
  const miPeticion = ++peticionCarrusel;
  carrusel.innerHTML = "";

  const MAX_CARRUSEL = 10;

  try {
    const destacados = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", categoria),
      where("destacado", "==", true),
      orderBy("fechaPublicacion", "desc"),
      limit(MAX_CARRUSEL)
    ));

    const articulos = destacados.docs.map(d => ({ _id: d.id, ...d.data() }));

    // Los destacados van primero; si no alcanzan, se completa con los más recientes
    if (articulos.length < MAX_CARRUSEL) {
      const recientes = await getDocs(query(
        collection(db, "articulos"),
        where("estado", "==", "publicado"),
        where("categoria", "==", categoria),
        orderBy("fechaPublicacion", "desc"),
        limit(MAX_CARRUSEL)
      ));
      const ids = new Set(articulos.map(a => a._id));
      recientes.forEach(d => {
        if (articulos.length < MAX_CARRUSEL && !ids.has(d.id)) articulos.push({ _id: d.id, ...d.data() });
      });
    }

    // Si el usuario ya cambió de pestaña, no pintar resultados viejos
    if (miPeticion !== peticionCarrusel) return;

    if (articulos.length === 0) {
      carrusel.innerHTML = "<p style='padding:1rem;color:#555'>Sin artículos en esta categoría.</p>";
      return;
    }

    articulos.forEach(a => {
      const tarjeta = document.createElement("div");
      tarjeta.className = "tarjeta";
      tarjeta.style.backgroundImage = fondo(a.imagenURL);
      tarjeta.style.cursor = "pointer";
      tarjeta.innerHTML = `<div class="articulo-overlay"><p class="articulo-titulo">${escaparHTML(a.titulo)}</p></div>`;
      tarjeta.addEventListener("click", () => {
        window.location.href = `articulo.html?id=${a._id}`;
      });
      carrusel.appendChild(tarjeta);
    });

  } catch (error) {
    if (miPeticion !== peticionCarrusel) return;
    carrusel.innerHTML = "<p style='padding:1rem;color:#555'>No se pudieron cargar los artículos.</p>";
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

// --- EXPLORAR: panel compartido de resultados ---
const explorarResultados = document.getElementById("explorar-resultados");
const explorarTitulo     = document.getElementById("explorar-titulo");
let elementoActivo = null;
let panelActivo    = "mundo";

function limpiarActivo() {
  if (elementoActivo) { elementoActivo.classList.remove("activo"); elementoActivo = null; }
}

function cerrarResultados() {
  explorarResultados.style.display = "none";
  limpiarActivo();
}

document.getElementById("explorar-cerrar").addEventListener("click", cerrarResultados);

// --- CARGAR ARTÍCULOS (genérico) ---
async function cargarArticulosExplorar(filtros, nombre) {
  const contenedor = document.getElementById("explorar-articulos");
  explorarTitulo.textContent = nombre.toUpperCase();
  explorarResultados.style.display = "block";
  contenedor.innerHTML = "<p class='mundo-vacio'>Cargando...</p>";
  explorarResultados.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const condiciones = [
      where("estado", "==", "publicado"),
      ...Object.entries(filtros).map(([campo, valor]) => where(campo, "==", valor)),
      orderBy("fechaPublicacion", "desc"),
      limit(9)
    ];
    const snap = await getDocs(query(collection(db, "articulos"), ...condiciones));

    if (snap.empty) {
      contenedor.innerHTML = "<p class='mundo-vacio'>Sin artículos aquí por ahora.</p>";
      return;
    }

    contenedor.innerHTML = "";
    snap.forEach(documento => {
      const a = { _id: documento.id, ...documento.data() };
      const tarjeta = document.createElement("article");
      tarjeta.className = "articulo mundo-tarjeta";
      tarjeta.style.backgroundImage = fondo(a.imagenURL);
      tarjeta.innerHTML = `<div class="articulo-overlay"><p class="articulo-titulo">${escaparHTML(a.titulo)}</p></div>`;
      tarjeta.addEventListener("click", () => {
        window.location.href = `articulo.html?id=${a._id}`;
      });
      contenedor.appendChild(tarjeta);
    });
  } catch (error) {
    contenedor.innerHTML = "<p class='mundo-vacio'>Error al cargar artículos.</p>";
    console.error(error);
  }
}

// --- MAPA MUNDIAL: continentes ---
document.querySelectorAll(".continente").forEach(g => {
  const activar = () => {
    if (elementoActivo === g) { cerrarResultados(); return; }
    limpiarActivo();
    g.classList.add("activo");
    elementoActivo = g;
    cargarArticulosExplorar(
      { categoria: "mundo", continente: g.dataset.continente },
      g.dataset.nombre
    );
  };
  g.addEventListener("click", activar);
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activar(); }
  });
});

// --- SUBCATEGORÍAS (informática, gastronomía) ---
document.querySelectorAll(".subcat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (elementoActivo === btn) { cerrarResultados(); return; }
    limpiarActivo();
    btn.classList.add("activo");
    elementoActivo = btn;
    cargarArticulosExplorar(
      { categoria: btn.dataset.cat, subcategoria: btn.dataset.sub },
      btn.textContent.trim()
    );
  });
});

// --- OCIO: zonas ---
document.querySelectorAll(".ocio-zona").forEach(zona => {
  zona.addEventListener("click", () => {
    if (elementoActivo === zona) { cerrarResultados(); return; }
    limpiarActivo();
    zona.classList.add("activo");
    elementoActivo = zona;
    cargarArticulosExplorar(
      { categoria: zona.dataset.cat, subcategoria: zona.dataset.sub },
      zona.querySelector(".ocio-zona-label").textContent
    );
  });
});

// --- TABS EXPLORAR: cambio con fade ---
document.querySelectorAll(".explorar-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const nuevo = tab.dataset.panel;
    if (nuevo === panelActivo) return;

    cerrarResultados();

    const saliente = document.getElementById(`panel-${panelActivo}`);
    saliente.style.opacity = "0";

    setTimeout(() => {
      saliente.classList.add("explorar-panel-oculto");
      const entrante = document.getElementById(`panel-${nuevo}`);
      entrante.classList.remove("explorar-panel-oculto");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        entrante.style.opacity = "1";
      }));
      panelActivo = nuevo;
    }, 250);

    document.querySelectorAll(".explorar-tab").forEach(t => t.classList.remove("activo"));
    tab.classList.add("activo");
  });
});

// --- INICIALIZAR ---
const tabActivo = document.querySelector(".tab.activo");
cargarUltimasNoticias();
cargarVidaEstudiantil();
cargarCarrusel(tabActivo ? tabActivo.dataset.categoria : "mundo");
