import { cargarPdfjs } from "@/components/VisorPdf";

/** Texto de un PDF (para la búsqueda). Se recorta para no guardar documentos enormes. */
export async function extraerTextoPdf(datos: Blob | ArrayBuffer, maxCaracteres = 300_000) {
  const lib = await cargarPdfjs();
  const buffer = datos instanceof Blob ? await datos.arrayBuffer() : datos;
  const doc = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  try {
    let texto = "";
    for (let n = 1; n <= doc.numPages && texto.length < maxCaracteres; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      texto += contenido.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return texto.replace(/[ \t]+/g, " ").trim().slice(0, maxCaracteres);
  } finally {
    void doc.destroy();
  }
}
