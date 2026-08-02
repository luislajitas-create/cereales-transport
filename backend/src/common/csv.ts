// CAT-1 (importación masiva de Clientes/Transportistas): parser CSV mínimo (RFC4180-lite —
// separador coma, comillas dobles para escapar campos con comas/comillas embebidas, típico de
// exports de Excel/Google Sheets). No se agrega una librería de terceros para esto: el formato
// esperado son columnas simples de texto, sin CSVs multi-línea complejos que lo justifiquen.
export function parsearCsv(contenido: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;
  const texto = contenido.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
      continue;
    }
    if (c === ",") {
      fila.push(campo);
      campo = "";
      continue;
    }
    if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
      continue;
    }
    campo += c;
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  // Descarta líneas completamente vacías (frecuentes al final de un CSV exportado).
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

// Mapea filas crudas a objetos por nombre de encabezado (no por posición) — más tolerante a
// variaciones de orden de columnas en el archivo subido, siempre que los nombres de encabezado
// coincidan con la plantilla descargable.
export function filasComoObjetos(filas: string[][]): Record<string, string>[] {
  if (filas.length === 0) return [];
  const encabezados = filas[0].map((h) => h.trim());
  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {};
    encabezados.forEach((h, i) => {
      obj[h] = (fila[i] ?? "").trim();
    });
    return obj;
  });
}
