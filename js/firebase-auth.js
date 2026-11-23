// firebase-auth.js — Auth, solo para login/registro/paneles (la portada no lo carga)
import { app } from "./firebase.js";
import { initializeAuth,
         indexedDBLocalPersistence,
         browserLocalPersistence,
         browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// initializeAuth en vez de getAuth: getAuth trae el soporte de login con Google (popups),
// que en celular/Safari carga apis.google.com + un iframe de firebaseapp.com ANTES de
// poder iniciar sesión. Solo usamos correo/contraseña. Persistencia igual a la de getAuth.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]
});
