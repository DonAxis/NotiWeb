// articulos.js — portada: territorio estudiantil, últimas noticias, te puede interesar y explorar
import { db } from "./firebase.js";
import { collection, query, where, orderBy, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore-lite.js";
import { escaparHTML, nombreCategoria } from "./utilidades.js";

// style.backgroundImage no decodifica entidades HTML: aquí la URL va cruda, solo http(s) y sin comillas
const fondo = (url) => {
  const u = String(url ?? "").trim();
  return /^https?:\/\//i.test(u) && !/["\\\n]/.test(u) ? `url("${u}")` : "";
};

const NUM_ULTIMAS   = 5;
const MAX_INTERESAR = 8;
// Territorio estudiantil (vida_estudiantil) NO entra aquí: tiene su propia sección y no se mezcla con las demás
const CATEGORIAS_VALIDAS = ["mundo", "informatica", "gastronomia", "ocio", "geochisme"];

const fechaCorta = (a) => a.fechaPublicacion?.toDate().toLocaleDateString("es-MX", {
  day: "numeric", month: "short", year: "numeric"
}) ?? "";

// --- PORTADA: una sola consulta alimenta ÚLTIMAS NOTICIAS y TE PUEDE INTERESAR ---
async function cargarPortada() {
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      orderBy("fechaPublicacion", "desc"),
      limit(60)
    ));
    const todos = snap.docs.map(d => ({ _id: d.id, ...d.data() }))
      .filter(a => a.categoria !== "vida_estudiantil");
    pintarUltimas(todos.slice(0, NUM_ULTIMAS));
    pintarInteresar(todos.slice(NUM_ULTIMAS));
  } catch (error) {
    console.error("Error al cargar la portada:", error);
    document.getElementById("carrusel").innerHTML =
      "<p class='carrusel-vacio'>No se pudieron cargar los artículos.</p>";
  }
}

function pintarUltimas(articulos) {
  if (articulos[0]) {
    const el = document.getElementById("articulo-destacado");
    el.style.backgroundImage = fondo(articulos[0].imagenURL);
    el.querySelector(".articulo-titulo").textContent = articulos[0].titulo;
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
    secundarios[i].addEventListener("click", () => {
      window.location.href = `articulo.html?id=${a._id}`;
    });
  });
}

// --- TERRITORIO ESTUDIANTIL: la más reciente con extracto + 2 anteriores en lista ---
const PALABRAS_EXTRACTO = 30;

function extracto(texto) {
  const palabras = String(texto ?? "").replace(/\*\*/g, "").split(/\s+/).filter(Boolean);
  return palabras.slice(0, PALABRAS_EXTRACTO).join(" ") + (palabras.length > PALABRAS_EXTRACTO ? "…" : "");
}

async function cargarTerritorio() {
  try {
    const snap = await getDocs(query(
      collection(db, "articulos"),
      where("estado", "==", "publicado"),
      where("categoria", "==", "vida_estudiantil"),
      orderBy("fechaPublicacion", "desc"),
      limit(3)
    ));
    const articulos = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    // Sin publicaciones la sección no aparece: un "Próximamente" hasta arriba se ve abandonado
    if (articulos.length === 0) return;

    const [principal, ...resto] = articulos;
    const enlace = document.getElementById("territorio-principal");
    enlace.href = `articulo.html?id=${encodeURIComponent(principal._id)}`;
    enlace.querySelector(".territorio-imagen").style.backgroundImage = fondo(principal.imagenURL);
    enlace.querySelector(".territorio-titulo").textContent   = principal.titulo;
    enlace.querySelector(".territorio-fecha").textContent    = fechaCorta(principal);
    enlace.querySelector(".territorio-extracto").textContent = extracto(principal.contenido);

    const lista = document.getElementById("territorio-lista");
    if (resto.length === 0) {
      lista.remove();
    } else {
      lista.innerHTML = resto.map(a => `
        <li><a href="articulo.html?id=${encodeURIComponent(a._id)}">
          <span class="territorio-lista-titulo">${escaparHTML(a.titulo)}</span>
          <span class="territorio-fecha">${escaparHTML(fechaCorta(a))}</span>
        </a></li>`).join("");
    }

    document.getElementById("seccion-territorio").style.display = "";
  } catch (error) {
    console.error("Error al cargar territorio estudiantil:", error);
  }
}

// --- TE PUEDE INTERESAR: al azar, sin repetir las últimas noticias ---
function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function pintarInteresar(candidatos) {
  const carrusel = document.getElementById("carrusel");

  // Solo categorías vigentes (evita artículos viejos como "Prueba"/tecnologia)
  const validos = candidatos.filter(a => CATEGORIAS_VALIDAS.includes(a.categoria));

  // Los destacados por el editor entran primero (también en orden aleatorio)
  const destacados = barajar(validos.filter(a => a.destacado));
  const resto      = barajar(validos.filter(a => !a.destacado));
  const elegidos   = [...destacados, ...resto].slice(0, MAX_INTERESAR);

  if (elegidos.length === 0) {
    document.querySelector(".interesar").style.display = "none";
    return;
  }

  carrusel.innerHTML = "";
  elegidos.forEach(a => {
    const fecha = fechaCorta(a);
    const tarjeta = document.createElement("a");
    tarjeta.className = "tarjeta";
    tarjeta.href      = `articulo.html?id=${encodeURIComponent(a._id)}`;
    tarjeta.innerHTML = `
      <div class="tarjeta-imagen"></div>
      <div class="tarjeta-cuerpo">
        <span class="tarjeta-categoria">${escaparHTML(nombreCategoria(a.categoria))}</span>
        <p class="tarjeta-titulo">${escaparHTML(a.titulo)}</p>
        <span class="tarjeta-fecha">${escaparHTML(fecha)}</span>
      </div>`;
    tarjeta.querySelector(".tarjeta-imagen").style.backgroundImage = fondo(a.imagenURL);
    carrusel.appendChild(tarjeta);
  });

  actualizarFlechas();
}

// --- NAVEGACIÓN DEL CARRUSEL (flechas solo en pantallas grandes; en celular se desliza) ---
const carruselEl = document.getElementById("carrusel");
const btnPrev    = document.querySelector(".carrusel-prev");
const btnNext    = document.querySelector(".carrusel-next");

function actualizarFlechas() {
  const max = carruselEl.scrollWidth - carruselEl.clientWidth;
  btnPrev.disabled = carruselEl.scrollLeft <= 4;
  btnNext.disabled = carruselEl.scrollLeft >= max - 4;
}

const anchoPaso = () => {
  const tarjeta = carruselEl.querySelector(".tarjeta");
  return tarjeta ? tarjeta.offsetWidth + 14 : 240;
};
btnNext.addEventListener("click", () => carruselEl.scrollBy({ left:  anchoPaso(), behavior: "smooth" }));
btnPrev.addEventListener("click", () => carruselEl.scrollBy({ left: -anchoPaso(), behavior: "smooth" }));
carruselEl.addEventListener("scroll", actualizarFlechas, { passive: true });
window.addEventListener("resize", actualizarFlechas);

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
      // El mismo mapa sirve para MUNDO y GEOCHISME: la categoría viene del panel
      { categoria: g.closest(".explorar-panel").dataset.categoria, continente: g.dataset.continente },
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
cargarPortada();
cargarTerritorio();
