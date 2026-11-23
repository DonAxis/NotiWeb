// firebase-storage.js — Storage, solo para los paneles que suben imágenes (escritor, editor)
import { app }        from "./firebase.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

export const storage = getStorage(app);
