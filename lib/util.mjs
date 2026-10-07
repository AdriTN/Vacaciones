// Utilidades de fechas (sin dependencias; valen en Node y en el navegador). Todo en UTC a mediodía para evitar saltos de hora.
export const ymd = (d) => d.toISOString().slice(0, 10);
export const parseISO = (iso) => new Date(iso + "T12:00:00Z");
export const sumarDias = (iso, n) => { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const dow = (iso) => parseISO(iso).getUTCDay(); // 0 = domingo
export const diasEntre = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const iso = (a, m, d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const rango = (a, b) => { const out = []; for (let d = a; d <= b; d = sumarDias(d, 1)) out.push(d); return out; };
export const anioDe = (isoStr) => Number(isoStr.slice(0, 4));
export const mesDe = (isoStr) => Number(isoStr.slice(5, 7));
export const hoyISO = (zona = "Atlantic/Canary", fecha = new Date()) => fecha.toLocaleDateString("sv-SE", { timeZone: zona });

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fechaCorta = (i) => `${DIAS[dow(i)].slice(0, 3)} ${Number(i.slice(8))} ${MESES[mesDe(i) - 1].slice(0, 3)}`;
export const fechaLarga = (i) => `${DIAS[dow(i)]} ${Number(i.slice(8))} de ${MESES[mesDe(i) - 1]}`;
export const fechaLargaCap = (i) => cap(fechaLarga(i));
export const rangoTexto = (a, b) => a === b ? fechaLarga(a) : (a.slice(0, 7) === b.slice(0, 7)
  ? `${DIAS[dow(a)]} ${Number(a.slice(8))} – ${DIAS[dow(b)]} ${Number(b.slice(8))} de ${MESES[mesDe(b) - 1]}`
  : `${fechaLarga(a)} – ${fechaLarga(b)}`);
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
