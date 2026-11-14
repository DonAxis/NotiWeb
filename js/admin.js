// admin.js — panel del administrador
import { auth, db }                              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, doc, setDoc, updateDoc,
         getDocs, deleteDoc, getDoc,
         query, where, writeBatch,
         Timestamp }                             from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { escaparHTML }                           from "./utilidades.js";

// --- PROTECCIÓN DE RUTA ---
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }

  // Verificar que sea admin
  const snap = await getDoc(doc(db, "usuarios", usuario.uid));
  if (!snap.exists() || snap.data().rol !== "admin") {
    await signOut(auth);
    window.location.href = "login.html";
    return;
  }

  document.getElementById("nombre-usuario").textContent = usuario.displayName || usuario.email;
  cargarReporte();
  cargarPendientes();
  cargarUsuarios();
  cargarVigias(usuario.uid);
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// --- REPORTE DE ARTÍCULOS ---
async function cargarReporte() {
  try {
    const [snap, snapLect] = await Promise.all([
      getDocs(collection(db, "articulos")),
      // Si las reglas de /lecturas aún no están publicadas, el reporte sigue funcionando sin ellas
      getDocs(collection(db, "lecturas")).catch(error => {
        console.warn("Sin acceso a lecturas:", error.code ?? error);
        return null;
      }),
    ]);

    const lecturas = {};          // idArticulo → N
    snapLect?.forEach(d => { lecturas[d.id] = d.data().lecturas ?? 0; });
    const titulos  = {};          // idArticulo → { titulo, autor }

    const conteo    = { borrador: 0, aceptado: 0, publicado: 0, rechazado: 0, total: 0 };
    const porAutor  = {}; // uid → { aceptado: N, publicado: N }

    snap.forEach(documento => {
      const datos = documento.data();
      titulos[documento.id] = { titulo: datos.titulo, autor: datos.autorNombre };
      conteo.total++;
      if (datos.estado in conteo) conteo[datos.estado]++;

      if (datos.uid && (datos.estado === "aceptado" || datos.estado === "publicado")) {
        if (!porAutor[datos.uid]) porAutor[datos.uid] = { aceptado: 0, publicado: 0, lecturas: 0 };
        porAutor[datos.uid][datos.estado]++;
        porAutor[datos.uid].lecturas += lecturas[documento.id] ?? 0;
      }
    });

    document.getElementById("stat-borrador").textContent  = conteo.borrador;
    document.getElementById("stat-aceptado").textContent  = conteo.aceptado;
    document.getElementById("stat-publicado").textContent = conteo.publicado;
    document.getElementById("stat-rechazado").textContent = conteo.rechazado;
    document.getElementById("stat-total").textContent     = conteo.total;

    pintarMasLeidas(lecturas, titulos);

    const contenedor = document.getElementById("stat-autores");
    const uids       = Object.keys(porAutor);

    if (uids.length === 0) {
      contenedor.innerHTML = "<p style='color:#888; padding:16px; font-size:0.85rem;'>Sin artículos aceptados o publicados aún.</p>";
      return;
    }

    // Obtener nombres de los escritores en paralelo
    const nombres = {};
    await Promise.all(uids.map(async uid => {
      try {
        const docSnap = await getDoc(doc(db, "usuarios", uid));
        nombres[uid] = docSnap.exists() ? (docSnap.data().nombre || uid) : uid;
      } catch { nombres[uid] = uid; }
    }));

    // Ordenar por publicados desc, luego aceptados desc
    const ordenados = uids.sort((a, b) =>
      (porAutor[b].publicado - porAutor[a].publicado) ||
      (porAutor[b].aceptado  - porAutor[a].aceptado)
    );

    const filas = ordenados.map(uid => `
      <tr>
        <td>${escaparHTML(nombres[uid])}</td>
        <td style="text-align:center;">${porAutor[uid].aceptado}</td>
        <td style="text-align:center; color:#1565c0; font-weight:700;">${porAutor[uid].publicado}</td>
        <td style="text-align:center;">${porAutor[uid].lecturas}</td>
      </tr>`).join("");

    contenedor.innerHTML = `
      <table class="tabla-usuarios">
        <thead>
          <tr>
            <th>Autor</th>
            <th style="text-align:center;">Aceptados</th>
            <th style="text-align:center;">Publicados</th>
            <th style="text-align:center;">👁 Lecturas</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;

  } catch (error) {
    console.error("Error al cargar reporte:", error);
  }
}

function pintarMasLeidas(lecturas, titulos) {
  const contenedor = document.getElementById("stat-leidas");
  const top = Object.entries(lecturas)
    .filter(([id]) => titulos[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (top.length === 0) {
    contenedor.innerHTML = "<p style='color:#888; padding:16px; font-size:0.85rem;'>Aún no hay lecturas registradas.</p>";
    return;
  }

  const filas = top.map(([id, n], i) => `
    <tr>
      <td style="text-align:center; color:#888;">${i + 1}</td>
      <td><a href="articulo.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener" style="color:inherit;">${escaparHTML(titulos[id].titulo)}</a></td>
      <td>${escaparHTML(titulos[id].autor ?? "—")}</td>
      <td style="text-align:center; font-weight:700;">${n}</td>
    </tr>`).join("");

  contenedor.innerHTML = `
    <table class="tabla-usuarios">
      <thead>
        <tr><th style="text-align:center;">#</th><th>Noticia</th><th>Autor</th><th style="text-align:center;">👁</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

// --- SOLICITUDES PENDIENTES ---
async function cargarPendientes() {
  const tbody = document.getElementById("pendientes-body");
  tbody.innerHTML = `<tr><td colspan="3" style="color:#888; padding:16px;">Cargando...</td></tr>`;

  try {
    const q    = query(collection(db, "usuarios"), where("rol", "==", "pendiente"));
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="3" style="color:#888; padding:16px;">Sin solicitudes pendientes.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach((documento) => {
      const { nombre, correo } = documento.data();
      const uid = documento.id;
      tbody.innerHTML += `
        <tr>
          <td>${escaparHTML(nombre ?? "—")}</td>
          <td>${escaparHTML(correo ?? "—")}</td>
          <td>
            <select class="sel-rol" data-uid="${escaparHTML(uid)}">
              <option value="escritor">Escritor</option>
              <option value="editor">Editor</option>
            </select>
            <button class="btn-aprobar"  data-uid="${escaparHTML(uid)}" data-nombre="${escaparHTML(nombre)}">Aprobar</button>
            <button class="btn-eliminar" data-uid="${escaparHTML(uid)}" data-nombre="${escaparHTML(nombre)}">Rechazar</button>
          </td>
        </tr>`;
    });

    tbody.querySelectorAll(".btn-aprobar").forEach(btn => {
      btn.addEventListener("click", () => {
        const sel = tbody.querySelector(`.sel-rol[data-uid="${btn.dataset.uid}"]`);
        aprobarUsuario(btn.dataset.uid, btn.dataset.nombre, sel.value);
      });
    });
    tbody.querySelectorAll(".btn-eliminar").forEach(btn =>
      btn.addEventListener("click", () => bloquearUsuario(btn.dataset.uid, btn.dataset.nombre))
    );

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--rojo); padding:16px;">Error al cargar solicitudes.</td></tr>`;
    console.error(error);
  }
}

async function aprobarUsuario(uid, nombre, rol) {
  if (!confirm(`¿Aprobar a "${nombre}" como ${rol}?`)) return;
  try {
    await updateDoc(doc(db, "usuarios", uid), { rol });
    cargarPendientes();
    cargarUsuarios();
  } catch (error) {
    alert("Error al aprobar. Intenta de nuevo.");
    console.error(error);
  }
}

// --- CARGAR USUARIOS ---
async function cargarUsuarios() {
  const tbody = document.getElementById("tabla-body");
  tbody.innerHTML = `<tr><td colspan="4" style="color:#888; padding:16px;">Cargando...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "usuarios"));

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:#888; padding:16px;">Sin usuarios registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach((documento) => {
      const { nombre, correo, rol } = documento.data();
      const uid = documento.id;

      const accion = rol === "admin"
        ? `<span style="color:#aaa; font-size:0.75rem;">—</span>`
        : rol === "bloqueado"
          ? `<button class="btn-aprobar btn-desbloquear" data-uid="${escaparHTML(uid)}" data-nombre="${escaparHTML(nombre)}">Desbloquear</button>`
          : `<button class="btn-eliminar" data-uid="${escaparHTML(uid)}" data-nombre="${escaparHTML(nombre)}">Bloquear</button>`;

      tbody.innerHTML += `
        <tr>
          <td>${escaparHTML(nombre ?? "—")}</td>
          <td>${escaparHTML(correo ?? "—")}</td>
          <td><span class="badge-rol badge-${escaparHTML(rol)}">${escaparHTML(rol)}</span></td>
          <td>${accion}</td>
        </tr>`;
    });

    tbody.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => bloquearUsuario(btn.dataset.uid, btn.dataset.nombre));
    });
    tbody.querySelectorAll(".btn-desbloquear").forEach((btn) => {
      btn.addEventListener("click", () => desbloquearUsuario(btn.dataset.uid, btn.dataset.nombre));
    });

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--rojo); padding:16px;">Error al cargar usuarios.</td></tr>`;
    console.error(error);
  }
}

// --- BLOQUEAR USUARIO ---
// No se borra el doc: si se borrara, el usuario (que sigue en Firebase Auth)
// podría recrearlo con el auto-registro y volver a pedir acceso.
async function bloquearUsuario(uid, nombre) {
  if (!confirm(`¿Bloquear a "${nombre}"? No podrá entrar al portal ni volver a solicitar acceso.`)) return;

  try {
    await updateDoc(doc(db, "usuarios", uid), { rol: "bloqueado" });
    cargarPendientes();
    cargarUsuarios();
  } catch (error) {
    alert("Error al bloquear. Intenta de nuevo.");
    console.error(error);
  }
}

async function desbloquearUsuario(uid, nombre) {
  if (!confirm(`¿Desbloquear a "${nombre}"? Volverá a "Solicitudes pendientes" para que elijas su rol.`)) return;

  try {
    await updateDoc(doc(db, "usuarios", uid), { rol: "pendiente" });
    cargarPendientes();
    cargarUsuarios();
  } catch (error) {
    alert("Error al desbloquear. Intenta de nuevo.");
    console.error(error);
  }
}

// ─────────────────────────────────────────────────────────────
// VIGÍAS — programas de ejecución única
// Para agregar uno nuevo: añade un objeto al array VIGIAS_DEFINIDAS.
// ─────────────────────────────────────────────────────────────

const VIGIAS_DEFINIDAS = [
  {
    clave:       "v001-backfill-destacado",
    nombre:      "V001 · Backfill destacado",
    descripcion: "Pone destacado: false en todos los artículos que no tienen ese campo.",
    tarea: async () => {
      const snap = await getDocs(collection(db, "articulos"));
      const batch = writeBatch(db);
      let contador = 0;
      snap.forEach(documento => {
        if (documento.data().destacado === undefined) {
          batch.update(doc(db, "articulos", documento.id), { destacado: false });
          contador++;
        }
      });
      if (contador > 0) await batch.commit();
      return `${contador} artículo(s) actualizados.`;
    }
  },
  {
    clave:       "v002-backfill-autor",
    nombre:      "V002 · Backfill nombre de autor",
    descripcion: "Copia el nombre del escritor a autorNombre en los artículos que no lo tienen (para mostrar el autor al público).",
    tarea: async () => {
      const snap    = await getDocs(collection(db, "articulos"));
      const nombres = {};
      const batch   = writeBatch(db);
      let contador  = 0;
      for (const documento of snap.docs) {
        const { uid, autorNombre } = documento.data();
        if (!uid || autorNombre) continue;
        if (!(uid in nombres)) {
          const u = await getDoc(doc(db, "usuarios", uid));
          nombres[uid] = u.exists() ? (u.data().nombre || "") : "";
        }
        if (!nombres[uid]) continue;
        batch.update(doc(db, "articulos", documento.id), { autorNombre: nombres[uid] });
        contador++;
      }
      if (contador > 0) await batch.commit();
      return `${contador} artículo(s) actualizados.`;
    }
  },
  {
    clave:       "v003-archivar-categorias-obsoletas",
    nombre:      "V003 · Archivar artículos de categorías obsoletas",
    descripcion: "Pasa a estado \"archivado\" los publicados cuya categoría ya no existe (p. ej. el artículo \"Prueba\" de \"tecnologia\"). Dejan de verse en el portal.",
    tarea: async () => {
      const VALIDAS = ["mundo", "informatica", "gastronomia", "ocio", "vida_estudiantil"];
      const snap    = await getDocs(query(collection(db, "articulos"), where("estado", "==", "publicado")));
      const batch   = writeBatch(db);
      const titulos = [];
      snap.forEach(documento => {
        const { categoria, titulo } = documento.data();
        if (!VALIDAS.includes(categoria)) {
          batch.update(doc(db, "articulos", documento.id), { estado: "archivado", destacado: false });
          titulos.push(titulo);
        }
      });
      if (titulos.length > 0) await batch.commit();
      return `${titulos.length} archivado(s)${titulos.length ? ": " + titulos.join(", ") : ""}.`;
    }
  },
];

async function cargarVigias(uidAdmin) {
  const contenedor = document.getElementById("lista-vigias");
  contenedor.innerHTML = "";

  // Leer cuáles ya se ejecutaron
  const ejecutados = {};
  try {
    const snap = await getDocs(collection(db, "vigias"));
    snap.forEach(d => { ejecutados[d.id] = d.data(); });
  } catch (error) {
    console.error("Error al cargar vigías:", error);
  }

  VIGIAS_DEFINIDAS.forEach(vigia => {
    const info = ejecutados[vigia.clave];
    const hecho = !!info?.ejecutado;
    const fecha = hecho
      ? info.fechaEjecucion?.toDate().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
      : null;

    const card = document.createElement("div");
    card.className = "vigia-card";
    card.innerHTML = `
      <div class="vigia-info">
        <p class="vigia-nombre">${vigia.nombre}</p>
        <p class="vigia-desc">${vigia.descripcion}</p>
        ${hecho ? `<p class="vigia-fecha">✓ Ejecutado el ${fecha}</p>` : ""}
      </div>
      <button class="btn-vigia" data-clave="${vigia.clave}" ${hecho ? "disabled" : ""}>
        ${hecho ? "Completado" : "Ejecutar"}
      </button>`;

    const btn = card.querySelector(".btn-vigia");
    if (!hecho) {
      btn.addEventListener("click", () => ejecutarVigia(vigia, btn, uidAdmin));
    }

    contenedor.appendChild(card);
  });
}

async function ejecutarVigia(vigia, btn, uidAdmin) {
  if (!confirm(`¿Ejecutar "${vigia.nombre}"?\n\n${vigia.descripcion}\n\nEsta acción no puede deshacerse.`)) return;

  btn.disabled     = true;
  btn.textContent  = "Ejecutando...";

  try {
    const resultado = await vigia.tarea();

    await setDoc(doc(db, "vigias", vigia.clave), {
      ejecutado:       true,
      fechaEjecucion:  Timestamp.now(),
      ejecutadoPor:    uidAdmin,
      resultado:       resultado ?? "OK",
    });

    btn.textContent = "Completado";

    const infoEl = btn.closest(".vigia-card").querySelector(".vigia-info");
    const fecha  = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
    infoEl.insertAdjacentHTML("beforeend", `<p class="vigia-fecha">✓ Ejecutado el ${fecha} — ${escaparHTML(resultado ?? "OK")}</p>`);

  } catch (error) {
    btn.disabled    = false;
    btn.textContent = "Ejecutar";
    alert(`Error al ejecutar el vigía: ${error.message}`);
    console.error(error);
  }
}
