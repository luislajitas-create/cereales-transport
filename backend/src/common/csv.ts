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

// CAT-1/CAT-2: límite común a toda importación masiva por CSV del sistema (Transportistas,
// Clientes, Choferes, Vehículos). CAT-1 no había definido un límite explícito de filas — solo el
// límite de tamaño de archivo (2 MB) del FileInterceptor. Se hace explícito acá, en una única
// constante compartida, para que las cuatro importaciones se comporten igual y ninguna quede
// abierta a un archivo arbitrariamente grande mientras las demás no.
export const LIMITE_FILAS_IMPORTACION_CSV = 2000;

// Valida el encabezado de un archivo de importación ANTES de procesar cualquier fila (y antes de
// cualquier escritura): rechaza encabezados duplicados — que hoy pisarían datos silenciosamente
// al mapear por nombre en filasComoObjetos, ya que el último gana — y encabezados obligatorios
// ausentes. No rechaza columnas adicionales no reconocidas: filasComoObjetos ya las ignora (nunca
// se leen) porque cada controller solo lee las propiedades que conoce — mismo criterio que CAT-1,
// que jamás rechazó columnas de más.
export function validarEncabezados(encabezadoCrudo: string[], obligatorios: string[]): string | null {
  const encabezados = encabezadoCrudo.map((h) => h.trim());
  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  for (const h of encabezados) {
    if (h && vistos.has(h)) duplicados.add(h);
    vistos.add(h);
  }
  if (duplicados.size > 0) {
    return `El archivo tiene encabezados duplicados: ${Array.from(duplicados).join(", ")}.`;
  }
  const faltantes = obligatorios.filter((o) => !encabezados.includes(o));
  if (faltantes.length > 0) {
    return `Faltan encabezados obligatorios: ${faltantes.join(", ")}.`;
  }
  return null;
}
