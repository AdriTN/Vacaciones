// Festivos de Las Palmas de Gran Canaria. Orden de preferencia para cada año:
//   1) datos publicados/verificados (data/festivos.json)  2) reglas oficiales calculadas (estado "estimado").
// Después se aplican los ajustes manuales (data/manual.json) y los días de empresa que añada el usuario.
import { iso, sumarDias, ymd, dow, anioDe } from "./util.mjs";

export function pascua(a) { // Gregoriano (Meeus/Jones/Butcher)
  const A = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * A + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((A + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(a, mes, dia);
}
export const carnavalMartes = (a) => sumarDias(pascua(a), -47);

export const TIPOS = {
  nacional: { etiqueta: "Nacional", clase: "t-nac" },
  autonomico: { etiqueta: "Canarias", clase: "t-can" },
  insular: { etiqueta: "Gran Canaria", clase: "t-isl" },
  local: { etiqueta: "Las Palmas de G.C.", clase: "t-loc" },
  empresa: { etiqueta: "Empresa", clase: "t-emp" },
};

// Reglas de calendario (solo se usan si no hay datos publicados de ese año). Un festivo nacional en domingo
// pasa al lunes (como suele hacer el Estado); si el año real dice otra cosa, manda el dato oficial.
export function reglas(a) {
  const p = pascua(a);
  const nac = (fecha, nombre) => {
    if (dow(fecha) === 0) return { fecha: sumarDias(fecha, 1), nombre: `${nombre} (trasladado)`, tipo: "nacional" };
    return { fecha, nombre, tipo: "nacional" };
  };
  return [
    nac(iso(a, 1, 1), "Año Nuevo"), nac(iso(a, 1, 6), "Epifanía del Señor"),
    { fecha: sumarDias(p, -3), nombre: "Jueves Santo", tipo: "autonomico" },
    { fecha: sumarDias(p, -2), nombre: "Viernes Santo", tipo: "nacional" },
    nac(iso(a, 5, 1), "Fiesta del Trabajo"),
    { fecha: iso(a, 5, 30), nombre: "Día de Canarias", tipo: "autonomico" },
    nac(iso(a, 8, 15), "Asunción de la Virgen"), nac(iso(a, 10, 12), "Fiesta Nacional de España"),
    nac(iso(a, 11, 1), "Todos los Santos"), nac(iso(a, 12, 6), "Día de la Constitución"),
    nac(iso(a, 12, 8), "Inmaculada Concepción"), nac(iso(a, 12, 25), "Navidad"),
    { fecha: iso(a, 9, 8), nombre: "Nuestra Señora del Pino", tipo: "insular" },
    { fecha: carnavalMartes(a), nombre: "Martes de Carnaval", tipo: "local" },
    { fecha: iso(a, 6, 24), nombre: "Fundación de la ciudad (San Juan)", tipo: "local" },
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

// datos: contenido de data/festivos.json  { anios: { "2026": { estado, fuente, festivos: [...] } } }
// manual: { anadir: [{fecha, nombre}], quitar: ["AAAA-MM-DD"] }   empresa: [{fecha, nombre}] (días de cierre/propios)
export function festivosDelAnio(a, datos = {}, manual = {}, empresa = []) {
  const reg = datos?.anios?.[a];
  const base = reg?.festivos?.length ? reg.festivos.map((x) => ({ ...x })) : reglas(a).map((x) => ({ ...x, estimado: true }));
  const mapa = new Map(base.map((x) => [x.fecha, x]));
  for (const q of manual?.quitar || []) if (anioDe(q) === a) mapa.delete(q);
  for (const x of manual?.anadir || []) if (anioDe(x.fecha) === a) mapa.set(x.fecha, { tipo: "empresa", ...x, manual: true });
  for (const x of empresa) if (anioDe(x.fecha) === a) mapa.set(x.fecha, { tipo: "empresa", ...x });
  return {
    estado: reg?.estado || "estimado", fuente: reg?.fuente || "Calculado con las reglas oficiales; aún no hay calendario publicado de este año.",
    notas: reg?.notas || [], lista: [...mapa.values()].sort((x, y) => x.fecha.localeCompare(y.fecha)),
  };
}

// Mapa fecha → festivo para cualquier fecha (carga perezosa de cada año)
export function creaFestivos(datos, manual, empresa = []) {
  const cache = new Map();
  const anio = (a) => { if (!cache.has(a)) { const r = festivosDelAnio(a, datos, manual, empresa); cache.set(a, { ...r, mapa: new Map(r.lista.map((x) => [x.fecha, x])) }); } return cache.get(a); };
  return { anio, get: (i) => anio(anioDe(i)).mapa.get(i) || null };
}

export const ymdHoy = ymd;
