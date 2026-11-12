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
    const snap = await getDocs(collection(db, "articulos"));

    const conteo    = { borrador: 0, aceptado: 0, publicado: 0, rechazado: 0, total: 0 };
    const porAutor  = {}; // uid → { aceptado: N, publicado: N }

    snap.forEach(documento => {
      const datos = documento.data();
      conteo.total++;
      if (datos.estado in conteo) conteo[datos.estado]++;

      if (datos.uid && (datos.estado === "aceptado" || datos.estado === "publicado")) {
        if (!porAutor[datos.uid]) porAutor[datos.uid] = { aceptado: 0, publicado: 0 };
        porAutor[datos.uid][datos.estado]++;
      }
    });

    document.getElementById("stat-borrador").textContent  = conteo.borrador;
    document.getElementById("stat-aceptado").textContent  = conteo.aceptado;
    document.getElementById("stat-publicado").textContent = conteo.publicado;
    document.getElementById("stat-rechazado").textContent = conteo.rechazado;
    document.getElementById("stat-total").textContent     = conteo.total;

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
      </tr>`).join("");

    contenedor.innerHTML = `
      <table class="tabla-usuarios">
        <thead>
          <tr>
            <th>Autor</th>
            <th style="text-align:center;">Aceptados</th>
            <th style="text-align:center;">Publicados</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;

  } catch (error) {
    console.error("Error al cargar reporte:", error);
  }
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
      btn.addEventListener("click", () => eliminarUsuario(btn.dataset.uid, btn.dataset.nombre))
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

      // No mostrar botón de eliminar para admin
      const accion = rol !== "admin"
        ? `<button class="btn-eliminar" data-uid="${escaparHTML(uid)}" data-nombre="${escaparHTML(nombre)}">Eliminar</button>`
        : `<span style="color:#aaa; font-size:0.75rem;">—</span>`;

      tbody.innerHTML += `
        <tr>
          <td>${escaparHTML(nombre ?? "—")}</td>
          <td>${escaparHTML(correo ?? "—")}</td>
          <td><span class="badge-rol badge-${escaparHTML(rol)}">${escaparHTML(rol)}</span></td>
          <td>${accion}</td>
        </tr>`;
    });

    // Eventos de eliminar
    tbody.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => eliminarUsuario(btn.dataset.uid, btn.dataset.nombre));
    });

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--rojo); padding:16px;">Error al cargar usuarios.</td></tr>`;
    console.error(error);
  }
}

// --- ELIMINAR USUARIO ---
// Solo elimina el documento de Firestore (el rol).
// El usuario sigue existiendo en Firebase Auth pero no puede entrar al portal.
async function eliminarUsuario(uid, nombre) {
  if (!confirm(`¿Eliminar acceso de "${nombre}"? No podrá entrar al portal.`)) return;

  try {
    await deleteDoc(doc(db, "usuarios", uid));
    cargarUsuarios();
  } catch (error) {
    alert("Error al eliminar. Intenta de nuevo.");
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
    infoEl.insertAdjacentHTML("beforeend", `<p class="vigia-fecha">✓ Ejecutado el ${fecha} — ${resultado ?? "OK"}</p>`);

  } catch (error) {
    btn.disabled    = false;
    btn.textContent = "Ejecutar";
    alert(`Error al ejecutar el vigía: ${error.message}`);
    console.error(error);
  }
}
