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
  geochisme:        "Geochisme",
  vida_estudiantil: "Vida estudiantil",
};

export function nombreCategoria(cat) {
  return NOMBRES_CATEGORIA[cat] ?? cat ?? "";
}

// Reduce y convierte la imagen en el navegador antes de subirla, para que el escritor
// pueda usar la foto tal como sale del celular. Máx 1600 px de ancho, WebP calidad 0.8;
// si el navegador no sabe codificar WebP (Safari antiguo) usa JPEG.
// Si algo falla o el resultado pesa más, devuelve el archivo original.
export async function optimizarImagen(archivo, anchoMax = 1600, calidad = 0.8) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo); // respeta la orientación EXIF de fotos de celular
  } catch {
    return archivo;
  }

  const escala = Math.min(1, anchoMax / bitmap.width);
  const ancho  = Math.round(bitmap.width  * escala);
  const alto   = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width  = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // fondo blanco: un PNG transparente no queda negro si cae a JPEG
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  const aBlob = (tipo) => new Promise(r => canvas.toBlob(r, tipo, calidad));
  let blob = await aBlob("image/webp");
  let ext  = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await aBlob("image/jpeg");
    ext  = "jpg";
  }
  if (!blob || blob.size >= archivo.size) return archivo;

  const base = archivo.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 60) || "imagen";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
