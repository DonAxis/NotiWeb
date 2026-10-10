// firebase.js — inicialización central de Firebase
// Usar siempre con <script type="module"> en el HTML

import { initializeApp }     from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore }      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getStorage }        from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

export const firebaseConfig = {
  apiKey:            "AIzaSyCYSLTVLIKBC9T8UxIzoisDtYv02V6VD9w",
  authDomain:        "vigia-cientifico.firebaseapp.com",
  projectId:         "vigia-cientifico",
  storageBucket:     "vigia-cientifico.firebasestorage.app",
  messagingSenderId: "222954354689",
  appId:             "1:222954354689:web:2e3b1cc6f7d07d9f63a800",
  measurementId:     "G-83Z78J92NR"
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
