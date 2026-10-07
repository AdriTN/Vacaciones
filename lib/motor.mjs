// Motor de vacaciones: bloques libres, puentes rentables y plan óptimo del año. Funciones puras, sin DOM.
// Contexto: { festivos: {get(iso)}, semana: Set<0-6> (días que se trabaja), vac: Set<iso> (días de vacaciones elegidos),
//             bloqueados: Set<iso> (días en los que NO puedes pedir vacaciones) }
import { sumarDias, dow, iso, mesDe, anioDe, rango, diasEntre } from "./util.mjs";

export const SEMANA_L_V = new Set([1, 2, 3, 4, 5]);
export const esLaborable = (ctx, i) => ctx.semana.has(dow(i)) && !ctx.festivos.get(i);
const libreBase = (ctx, i) => !esLaborable(ctx, i);

function extender(ini, fin, libre, tope = 40) {
  let a = ini, b = fin, n = 0;
  while (n++ < tope && libre(sumarDias(a, -1))) a = sumarDias(a, -1);
  n = 0;
  while (n++ < tope && libre(sumarDias(b, 1))) b = sumarDias(b, 1);
  return [a, b];
}
const nombresFestivos = (ctx, a, b) => rango(a, b).map((d) => ctx.festivos.get(d)).filter(Boolean).map((f) => f.nombre);

function bloqueDeVentana(ctx, ini, fin, pedir) {
  const [a, b] = extender(ini, fin, (d) => libreBase(ctx, d));
  const libres = diasEntre(a, b) + 1;
  return { ini: a, fin: b, pedir, coste: pedir.length, libres, ganados: libres - pedir.length, mes: mesDe(pedir[0]), festivos: nombresFestivos(ctx, a, b) };
}

// Bloques que forman ya las vacaciones elegidas (agrupa días y los extiende a fines de semana/festivos contiguos)
export function bloquesActuales(ctx, anio = null) {
  const dias = [...ctx.vac].filter((d) => esLaborable(ctx, d) && (anio == null || anioDe(d) === anio)).sort();
  const libre = (d) => libreBase(ctx, d) || ctx.vac.has(d);
  const out = [];
  for (const d of dias) {
    if (out.length && d <= out[out.length - 1].fin) { out[out.length - 1].pedir.push(d); continue; }
    const [a, b] = extender(d, d, libre);
    out.push({ ini: a, fin: b, pedir: [d] });
  }
  return out.map((x) => {
    const libres = diasEntre(x.ini, x.fin) + 1;
    return { ...x, coste: x.pedir.length, libres, ganados: libres - x.pedir.length, festivos: nombresFestivos(ctx, x.ini, x.fin) };
  });
}

// Saldo del año. cfg: { diasAnuales, extra, entrantes (días guardados del año anterior), limiteEntrantes (fecha tope para
// gastarlos), guardar (días que decides guardar para el año siguiente), arrastreMax (máximo que permite la empresa), hoy }
export function saldo(ctx, cfg, anio) {
  const dias = [...ctx.vac].filter((d) => anioDe(d) === anio && esLaborable(ctx, d)).sort();
  const usados = dias.length;
  const entrantes = Number(cfg.entrantes ?? cfg.arrastrados ?? 0);
  const total = Number(cfg.diasAnuales || 0) + Number(cfg.extra || 0) + entrantes;
  const lim = cfg.limiteEntrantes || null;
  const antesDelLimite = lim ? dias.filter((d) => d <= lim).length : usados;
  const sinUsar = entrantes - Math.min(entrantes, antesDelLimite);
  const vencido = !!(lim && cfg.hoy && cfg.hoy > lim);
  const caducados = vencido ? sinUsar : 0;
  const restantes = total - usados - caducados;
  const max = Math.max(0, Number(cfg.arrastreMax || 0));
  const guardables = Math.max(0, Math.min(max, restantes));
  const guardar = Math.max(0, Math.min(Number(cfg.guardar || 0), guardables));
  const reserva = Math.max(0, Math.min(Number(cfg.reserva || 0), Math.max(0, restantes - guardar)));
  return { total, usados, restantes, entrantes, entrantesEnRiesgo: vencido ? 0 : sinUsar, limiteEntrantes: lim, caducados, guardables, guardar, reserva, aUsar: Math.max(0, restantes - guardar - reserva) };
}
// Días sobrantes que se podrán guardar y los que se perderían si no se usan antes de fin de año
export const guardadosParaSiguiente = (s) => s.guardar;
export function conflictos(ctx) {
  return [...ctx.vac].sort().filter((d) => !esLaborable(ctx, d)).map((d) => {
    const f = ctx.festivos.get(d);
    return { fecha: d, motivo: f ? `ahora es festivo (${f.nombre})` : "cae en día no laborable" };
  }).concat([...ctx.vac].sort().filter((d) => ctx.bloqueados.has(d)).map((d) => ({ fecha: d, motivo: "lo habías marcado como no disponible" })));
}

// Todas las ventanas de días laborables consecutivos (el hueco entre dos laborables siempre es no laborable)
// y el bloque libre que producirían. Con `desde` solo se consideran días a partir de esa fecha.
export function candidatos(ctx, anio, { maxCoste = 8, minCoste = 1, minLibres = 0, desde = null, hasta = null, ocupados = [] } = {}) {
  const dias = rango(iso(anio, 1, 1), iso(anio, 12, 31)).filter((d) => esLaborable(ctx, d));
  const out = [];
  for (let i = 0; i < dias.length; i++) {
    if (desde && dias[i] < desde) continue;
    for (let j = i; j < dias.length && j - i + 1 <= maxCoste; j++) {
      if (ctx.vac.has(dias[j]) || ctx.bloqueados.has(dias[j]) || (hasta && dias[j] > hasta)) break;
      if (j - i + 1 < minCoste) continue;
      const c = bloqueDeVentana(ctx, dias[i], dias[j], dias.slice(i, j + 1));
      if (c.libres < minLibres || ocupados.some((o) => tocan(c, o))) continue;
      out.push(c);
    }
  }
  return out;
}

const ratio = (c) => c.libres / c.coste;
// ¿Se solapan o quedan pegados dos bloques? (pegados se fundirían en uno solo)
// `m` = días de separación mínima exigida entre bloques
export const tocan = (a, b, m = 0) => a.ini <= sumarDias(b.fin, 1 + m) && a.fin >= sumarDias(b.ini, -1 - m);

// Mejores puentes: pocas jornadas pedidas para muchos días libres seguidos
export function puentes(ctx, anio, { maxCoste = 5, minRatio = 2, desde = null, limite = 40 } = {}) {
  const lista = candidatos(ctx, anio, { maxCoste, minLibres: 4, desde, ocupados: bloquesActuales(ctx, anio) })
    .filter((c) => ratio(c) >= minRatio && c.festivos.length > 0); // un puente de verdad incluye algún festivo
  const util = lista.filter((a) => !lista.some((b) => b !== a && b.ini <= a.ini && b.fin >= a.fin && b.coste <= a.coste && (b.ini < a.ini || b.fin > a.fin || b.coste < a.coste)));
  return util.sort((a, b) => ratio(b) - ratio(a) || b.libres - a.libres || a.ini.localeCompare(b.ini)).slice(0, limite);
}

export const PRESETS = {
  rendimiento: { nombre: "Máximo rendimiento", desc: "Aprovecha cada puente: más días libres por cada día pedido.", maxBloques: 10, minCoste: 1, maxCoste: 6, minLibres: 4, bonusLargo: null },
  equilibrado: { nombre: "Equilibrado", desc: "Escapadas de 5 a 9 días con buen rendimiento, sin días sueltos.", maxBloques: 5, minCoste: 3, maxCoste: 9, minLibres: 7, bonusLargo: { minLibres: 9, valor: 2 } },
  verano: { nombre: "Verano largo + puentes", desc: "Un bloque grande en verano y el resto en puentes.", maxBloques: 6, minCoste: 1, maxCoste: 6, ancla: { min: 10, max: 15, meses: [6, 7, 8, 9] }, minLibres: 4, bonusLargo: null },
  festivas: { nombre: "Semana Santa y Navidad", desc: "Prioriza Semana Santa, Navidad y Reyes.", maxBloques: 6, minCoste: 2, maxCoste: 8, pesos: { 3: 1.8, 4: 1.8, 12: 1.8, 1: 1.6 }, minLibres: 4, bonusLargo: null },
};

// Formas de repartir los días en el año
export const DISTRIBUCIONES = {
  concentrada: { nombre: "Concentrada", desc: "Pocos bloques largos: viajes de verdad.", maxBloques: 3, minCoste: 4, maxCoste: 15, minLibres: 8, separacion: 0, bonusLargo: { minLibres: 10, valor: 2 } },
  equilibrada: { nombre: "Equilibrada", desc: "Escapadas de 5 a 9 días, sin días sueltos.", maxBloques: 5, minCoste: 3, maxCoste: 9, minLibres: 6, separacion: 7, bonusLargo: { minLibres: 9, valor: 1.5 } },
  repartida: { nombre: "Repartida", desc: "Muchos descansos cortos y puentes, separados a lo largo del año.", maxBloques: 10, minCoste: 1, maxCoste: 5, minLibres: 4, separacion: 21, bonusLargo: null },
};

// Plan óptimo: elige bloques que no se tocan entre sí maximizando días libres dentro del presupuesto.
// Opciones: presupuesto, maxBloques, minCoste, maxCoste, minLibres, separacion (días mínimos entre bloques), pesos {mes: peso},
// bonusLargo, desde/hasta (fechas), anclas: [{min, max, meses?, filtro?(bloque)}] bloques que se quieren sí o sí (verano, Navidad…).
export function planOptimo(ctx, anio, opts = {}) {
  const o = { presupuesto: 0, maxBloques: 6, minCoste: 1, maxCoste: 8, minLibres: 4, separacion: 0, pesos: {}, bonusLargo: null, ancla: null, anclas: [], desde: null, hasta: null, ...opts };
  const specs = (o.anclas?.length ? o.anclas : o.ancla ? [o.ancla] : []).filter(Boolean);
  const B = Math.max(0, Math.floor(o.presupuesto));
  const existentes = bloquesActuales(ctx, anio);
  if (B === 0) return { bloques: [], coste: 0, libres: 0, ganados: 0, sinAsignar: 0, preset: o.nombre, anclasPedidas: specs.length, anclasCumplidas: 0 };
  const cumple = (sp, c) => c.coste >= sp.min && c.coste <= sp.max && (sp.filtro ? sp.filtro(c) : sp.meses ? sp.meses.includes(c.mes) : true);
  const todos = candidatos(ctx, anio, { maxCoste: Math.min(Math.max(o.maxCoste, ...specs.map((x) => x.max), 0), B), minCoste: 1, desde: o.desde, hasta: o.hasta, ocupados: existentes })
    .filter((c) => c.ganados >= 1 && ((c.coste >= o.minCoste && c.libres >= o.minLibres) || specs.some((sp) => cumple(sp, c))));
  const base = todos.filter((c) => c.coste <= o.maxCoste && c.coste >= o.minCoste && c.libres >= o.minLibres);
  const puntos = (c) => c.ganados * (o.pesos[c.mes] || 1) + (o.bonusLargo && c.libres >= o.bonusLargo.minLibres ? o.bonusLargo.valor : 0) + c.coste * 0.02;
  const choca = (a, c) => tocan(a, c, o.separacion);

  const resolver = (cands, presupuesto, maxB) => {
    const cs = cands.slice().sort((a, b) => a.fin.localeCompare(b.fin) || a.ini.localeCompare(b.ini));
    const n = cs.length, K = maxB + 1, W = presupuesto + 1;
    if (!n || maxB <= 0 || presupuesto <= 0) return { valor: 0, elegidos: [] };
    const fins = cs.map((c) => c.fin);
    const previo = cs.map((c) => { // cuántos candidatos (prefijo) acaban antes de ini - 1 - separación
      let lo = 0, hi = n; const lim = sumarDias(c.ini, -1 - o.separacion);
      while (lo < hi) { const m = (lo + hi) >> 1; if (fins[m] < lim) lo = m + 1; else hi = m; }
      return lo;
    });
    const dp = new Float64Array((n + 1) * K * W).fill(-Infinity), tomar = new Uint8Array((n + 1) * K * W);
    const at = (j, b, c) => (j * K + b) * W + c;
    dp[at(0, 0, 0)] = 0;
    for (let j = 1; j <= n; j++) {
      const c = cs[j - 1], sc = puntos(c), p = previo[j - 1];
      for (let b = 0; b < K; b++) for (let w = 0; w < W; w++) {
        let v = dp[at(j - 1, b, w)], t = 0;
        if (b >= 1 && w >= c.coste) { const alt = dp[at(p, b - 1, w - c.coste)] + sc; if (alt > v) { v = alt; t = 1; } }
        dp[at(j, b, w)] = v; tomar[at(j, b, w)] = t;
      }
    }
    let mejor = { v: -Infinity, b: 0, w: 0 };
    for (let b = 0; b < K; b++) for (let w = 0; w < W; w++) { const v = dp[at(n, b, w)]; if (v > mejor.v) mejor = { v, b, w }; }
    const elegidos = []; let j = n, b = mejor.b, w = mejor.w;
    while (j > 0 && b >= 0) {
      if (tomar[at(j, b, w)]) { const c = cs[j - 1]; elegidos.push(c); w -= c.coste; b -= 1; j = previo[j - 1]; } else j -= 1;
    }
    return { valor: mejor.v, elegidos: elegidos.reverse() };
  };

  // Anclas: se prueba cada combinación de los mejores candidatos de cada una (si no caben, esa ancla se ignora)
  const K = specs.length >= 2 ? 10 : 25;
  const buscar = (i, fijos, presupuesto, nb) => {
    if (i === specs.length) {
      const resto = resolver(base.filter((c) => !fijos.some((a) => choca(a, c))), presupuesto, nb);
      return { total: resto.valor + fijos.reduce((n, a) => n + puntos(a), 0), elegidos: [...fijos, ...resto.elegidos], cumplidas: fijos.length };
    }
    const cands = todos.filter((c) => cumple(specs[i], c) && c.coste <= presupuesto && nb > 0 && !fijos.some((a) => choca(a, c))).sort((a, b) => puntos(b) - puntos(a)).slice(0, K);
    let mejor = null;
    for (const a of cands) { const r = buscar(i + 1, [...fijos, a], presupuesto - a.coste, nb - 1); if (!mejor || r.total > mejor.total) mejor = r; }
    return mejor || buscar(i + 1, fijos, presupuesto, nb);
  };
  const { elegidos, cumplidas } = buscar(0, [], B, o.maxBloques);

  const bloques = elegidos.sort((a, b) => a.ini.localeCompare(b.ini));
  const coste = bloques.reduce((s, b) => s + b.coste, 0), libres = bloques.reduce((s, b) => s + b.libres, 0);
  return { bloques, coste, libres, ganados: libres - coste, sinAsignar: B - coste, preset: o.nombre, anclasPedidas: specs.length, anclasCumplidas: cumplidas, anclasNo: specs.filter((sp) => !bloques.some((b) => cumple(sp, b))).map((sp) => sp.id).filter(Boolean) };
}

// Cuántos días seguidos libres saldrían si pidieras solo ese día (mapa de calor)
export function valorDia(ctx, i) {
  if (!esLaborable(ctx, i) || ctx.vac.has(i) || ctx.bloqueados.has(i)) return 0;
  const [a, b] = extender(i, i, (d) => libreBase(ctx, d) || ctx.vac.has(d));
  return diasEntre(a, b) + 1;
}

// Resumen de un año: festivos que caen en fin de semana (se "pierden") y días laborables festivos
export function resumenAnio(ctx, anio, lista) {
  const enSemana = lista.filter((f) => ctx.semana.has(dow(f.fecha)));
  const perdidos = lista.filter((f) => !ctx.semana.has(dow(f.fecha)));
  return { total: lista.length, enSemana: enSemana.length, perdidos };
}

export function proximos(festivos, desde, n = 5) {
  const out = []; let d = desde;
  for (let k = 0; k < 800 && out.length < n; k++, d = sumarDias(d, 1)) { const f = festivos.get(d); if (f) out.push({ ...f, fecha: d }); }
  return out;
}

// Plan que primero coloca los días arrastrados (que caducan en `limite`) y después reparte el resto del año.
export function planConArrastre(ctx, anio, opts = {}) {
  const B = Math.max(0, Math.floor(opts.presupuesto || 0));
  const riesgo = Math.min(B, Math.floor(opts.riesgo || 0));
  if (!riesgo || !opts.limite) return planOptimo(ctx, anio, opts);
  const p1 = planOptimo(ctx, anio, { ...opts, presupuesto: riesgo, hasta: opts.limite, ancla: null, anclas: [] });
  const vac2 = new Set([...ctx.vac, ...p1.bloques.flatMap((b) => b.pedir)]);
  const p2 = planOptimo({ ...ctx, vac: vac2 }, anio, { ...opts, presupuesto: B - p1.coste });
  p2.anclasCumplidas += 0;
  const bloques = [...p1.bloques, ...p2.bloques].sort((a, b) => a.ini.localeCompare(b.ini));
  const coste = bloques.reduce((n, b) => n + b.coste, 0), libres = bloques.reduce((n, b) => n + b.libres, 0);
  return { bloques, coste, libres, ganados: libres - coste, sinAsignar: B - coste, preset: opts.nombre, arrastradosColocados: p1.coste, anclasPedidas: p2.anclasPedidas, anclasCumplidas: p2.anclasCumplidas, anclasNo: p2.anclasNo };
}
