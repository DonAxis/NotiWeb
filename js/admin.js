// admin.js — panel del administrador
import { auth, db, firebaseConfig }              from "./firebase.js";
import { onAuthStateChanged, signOut }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { initializeApp }                         from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword,
         signOut as signOutSecundario }          from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { collection, doc, setDoc,
         getDocs, deleteDoc, getDoc }            from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// App secundaria para crear usuarios sin cerrar la sesión del admin
const appSecundaria  = initializeApp(firebaseConfig, "secundaria");
const authSecundaria = getAuth(appSecundaria);

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
  cargarUsuarios();
});

// --- CERRAR SESIÓN ---
document.getElementById("btn-salir").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// --- REGISTRAR USUARIO ---
document.getElementById("form-registro").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btnRegistrar = document.getElementById("btn-registrar");
  const estadoTexto  = document.getElementById("form-estado");

  const nombre    = document.getElementById("nombre").value.trim();
  const correo    = document.getElementById("correo").value.trim();
  const contrasena = document.getElementById("contrasena").value;
  const rol       = document.getElementById("rol").value;

  btnRegistrar.disabled    = true;
  estadoTexto.style.color  = "#555";
  estadoTexto.textContent  = "Creando usuario...";

  try {
    // Crear en Firebase Auth usando la app secundaria (no afecta la sesión del admin)
    const resultado = await createUserWithEmailAndPassword(authSecundaria, correo, contrasena);
    const nuevoUid  = resultado.user.uid;

    // Cerrar sesión en la app secundaria inmediatamente
    await signOutSecundario(authSecundaria);

    // Guardar en Firestore
    await setDoc(doc(db, "usuarios", nuevoUid), { nombre, correo, rol });

    estadoTexto.style.color = "green";
    estadoTexto.textContent = `Usuario "${nombre}" registrado como ${rol}.`;
    e.target.reset();
    cargarUsuarios();

  } catch (error) {
    const codigos = {
      "auth/email-already-in-use": "Ese correo ya está registrado.",
      "auth/invalid-email":        "El correo no es válido.",
      "auth/weak-password":        "La contraseña debe tener al menos 6 caracteres.",
    };
    estadoTexto.style.color = "var(--rojo)";
    estadoTexto.textContent = codigos[error.code] ?? "Error al crear usuario.";
    console.error(error);
  } finally {
    btnRegistrar.disabled = false;
  }
});

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
        ? `<button class="btn-eliminar" data-uid="${uid}" data-nombre="${nombre}">Eliminar</button>`
        : `<span style="color:#aaa; font-size:0.75rem;">—</span>`;

      tbody.innerHTML += `
        <tr>
          <td>${nombre ?? "—"}</td>
          <td>${correo ?? "—"}</td>
          <td><span class="badge-rol badge-${rol}">${rol}</span></td>
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
