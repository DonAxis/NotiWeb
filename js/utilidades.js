// utilidades.js — helpers compartidos

// Todo dato que viene de Firestore y se inserta con innerHTML debe pasar por aquí:
// nombres, títulos y motivos los escriben usuarios y podrían contener <script>/onerror.
export function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Solo permite URLs http(s); evita javascript: en href/src
export function urlSegura(valor) {
  const texto = String(valor ?? "").trim();
  return /^https?:\/\//i.test(texto) ? escaparHTML(texto) : "";
}

export function renderContenido(texto) {
  return escaparHTML(texto).replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>");
}

const NOMBRES_CATEGORIA = {
  mundo:            "Mundo",
  informatica:      "Informática",
  gastronomia:      "Gastronomía",
  ocio:             "Ocio",
  vida_estudiantil: "Vida estudiantil",
};

export function nombreCategoria(cat) {
  return NOMBRES_CATEGORIA[cat] ?? cat ?? "";
}
