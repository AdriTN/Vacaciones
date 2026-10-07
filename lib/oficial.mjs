// Lectura del Boletín Oficial de Canarias (BOC). No tiene API: se lee el índice HTML de cada número
// (https://www.gobiernodecanarias.org/boc/AAAA/NNN/index.html) y el HTML de cada disposición.
import { sinTildes, MESES, iso, dow, sumarDias } from "./util.mjs";
import { reglas } from "./festivos.mjs";

export const urlIndice = (anio, num) => `https://www.gobiernodecanarias.org/boc/${anio}/${String(num).padStart(3, "0")}/index.html`;
export const urlHtml = (anio, num, disp) => `https://www.gobiernodecanarias.org/boc/${anio}/${String(num).padStart(3, "0")}/${disp}.html`;

export function limpiarMarcado(s) {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h\d|tr|br|td)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// [{anio, num, disp, titulo}] de un índice (enlaces a boc-a-AAAA-NNN-DDD.pdf)
export function parsearIndice(html) {
  const items = new Map();
  const re = /<a\b[^>]*href=["']([^"']*boc-a-(\d{4})-(\d{3})-(\d+)\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const [, , anio, num, disp, interior] = m;
    const titulo = limpiarMarcado(interior).replace(/\s+/g, " ").trim();
    const clave = `${anio}-${num}-${disp}`, previo = items.get(clave);
    if (!previo || titulo.length > previo.titulo.length) items.set(clave, { anio: Number(anio), num: Number(num), disp: Number(disp), titulo });
  }
  return [...items.values()].filter((i) => i.titulo.length > 25);
}

// ¿Es una disposición que nos interesa? "calendario de fiestas laborales" (Canarias) o "fiestas locales propias de cada municipio"
export function tipoDisposicion(titulo) {
  const t = sinTildes(titulo);
  if (/fiestas locales propias|fiestas locales .*municipio/.test(t)) return "locales";
  if (/fiestas laborales|calendario laboral|calendario de fiestas/.test(t)) return "laborales";
  return null;
}
export const anioDelTitulo = (titulo) => { const m = String(titulo).match(/(?:para el a[nñ]o|para)\s+(\d{4})/i) || String(titulo).match(/\b(20\d{2})\b(?!.*\b20\d{2}\b)/); return m ? Number(m[1]) : null; };

// Fiestas locales de Las Palmas de Gran Canaria dentro de la Orden de fiestas locales de Canarias.
// Estructura real del BOC: una línea con el municipio en mayúsculas ("LAS PALMAS DE GRAN CANARIA.") y debajo
// una línea por fiesta ("17 de febrero: Martes de Carnaval.").
export function localesLPGC(texto, anio) {
  const lineas = String(texto).split("\n").map((l) => l.trim()).filter(Boolean);
  const esMunicipio = (l) => /^[A-ZÁÉÍÓÚÑÜ0-9 ,'()\-/]{4,}\.?$/.test(l) && !/^\d/.test(l);
  const i = lineas.findIndex((l) => sinTildes(l).replace(/\.$/, "") === "las palmas de gran canaria");
  if (i < 0) return null;
  const out = [];
  for (let k = i + 1; k < lineas.length && !esMunicipio(lineas[k]); k++) {
    const m = sinTildes(lineas[k]).match(new RegExp(`^(\\d{1,2}) de (${MESES.map(sinTildes).join("|")})\\s*[:.\\-–]\\s*(.+?)\\.?$`));
    if (!m) continue;
    const nombre = lineas[k].replace(/^\d{1,2}\s+de\s+\p{L}+\s*[:.\-–]\s*/u, "").replace(/\.$/, "");
    out.push({ fecha: iso(anio, MESES.map(sinTildes).indexOf(m[2]) + 1, Number(m[1])), nombre: nombre.replace(/^Conmemoraci[oó]n de la Fundaci[oó]n de la Ciudad$/i, "Fundación de la ciudad (San Juan)"), tipo: "local" });
  }
  return out.length ? out : null;
}

// Fechas "D de mes" de un texto, ignorando las que llevan otro año explícito
export function fechasEn(texto, anio) {
  const t = sinTildes(texto).replace(/\s+/g, " "), out = new Set();
  const re = new RegExp(String.raw`\b(\d{1,2})\s+de\s+(${MESES.map(sinTildes).join("|")})(?:\s+de\s+(\d{4}))?`, "g");
  let m;
  while ((m = re.exec(t))) {
    if (m[3] && Number(m[3]) !== anio) continue;
    const prev = t.slice(Math.max(0, m.index - 14), m.index);
    if (/decreto|orden|resolucion|\bde\s*$/.test(prev) && /(decreto|orden|resolucion)[^;]{0,25}$/.test(prev)) continue; // fecha de la propia norma
    out.add(iso(anio, MESES.map(sinTildes).indexOf(m[2]) + 1, Number(m[1])));
  }
  return out;
}

const OTRAS_ISLAS = ["02-02", "08-05", "09-15", "09-17", "09-18", "09-24", "10-04", "10-05"];

// Decreto de fiestas laborales de Canarias → festivos comunes del año (nacionales + autonómicos + insular de Gran Canaria).
// Prudente: si no cuadra con lo esperado, no se aplica y se devuelve el motivo.
export function laboralesCanarias(texto, anio) {
  const cuerpo = (texto.match(/art[ií]culo\s+(?:1|[uú]nico)[\s\S]*/i) || [texto])[0];
  const todas = [...fechasEn(cuerpo, anio)].filter((f) => !OTRAS_ISLAS.includes(f.slice(5)));
  // "se traslada al lunes por coincidir el 15 de agosto en domingo": el domingo de origen se menciona pero no es festivo
  const fechas = todas.filter((f) => !(dow(f) === 0 && todas.includes(sumarDias(f, 1))));
  const esperado = reglas(anio).filter((f) => f.tipo !== "local");
  const set = new Set(esperado.map((f) => f.fecha));
  const coinciden = fechas.filter((f) => set.has(f)).length;
  if (fechas.length < 9) return { error: `solo ${fechas.length} fechas reconocidas` };
  if (coinciden < 8) return { error: `coincide con ${coinciden} festivos esperados; formato no reconocido` };
  const extra = fechas.filter((f) => !set.has(f)), faltan = [...set].filter((f) => !fechas.includes(f));
  if (extra.length > 2 || faltan.length > 2) return { error: `difiere demasiado de lo esperado (+${extra.join(",") || "ninguna"} / −${faltan.join(",") || "ninguna"})`, extra, faltan };
  const nom = new Map(esperado.map((f) => [f.fecha, f]));
  const lista = fechas.sort().map((f) => nom.get(f) || { fecha: f, nombre: "Festivo (traslado, revisar nombre)", tipo: dow(f) === 1 ? "nacional" : "autonomico" });
  // Los traslados a lunes que fija el decreto sustituyen al festivo teórico
  return { lista, extra, faltan };
}
