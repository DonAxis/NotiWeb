// firebase.js — app + Firestore. Es lo único que cargan las páginas públicas.
// Auth y Storage viven aparte (firebase-auth.js, firebase-storage.js) para que la portada
// no descargue código que no usa. Usar siempre con <script type="module"> en el HTML.

// Firestore Lite (35 KB vs 113 KB): usa peticiones HTTPS normales en vez del canal de
// streaming del SDK completo, que falla en datos móviles. No tiene onSnapshot ni caché
// offline; si algún día se necesitan, volver a firebase-firestore.js EN TODOS los archivos
// (no se pueden mezclar: cada SDK tiene su propia instancia de db).
import { initializeApp }     from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore }      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore-lite.js";

export const firebaseConfig = {
  apiKey:            "AIzaSyCYSLTVLIKBC9T8UxIzoisDtYv02V6VD9w",
  authDomain:        "vigia-cientifico.firebaseapp.com",
  projectId:         "vigia-cientifico",
  storageBucket:     "vigia-cientifico.firebasestorage.app",
  messagingSenderId: "222954354689",
  appId:             "1:222954354689:web:2e3b1cc6f7d07d9f63a800",
  measurementId:     "G-83Z78J92NR"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
