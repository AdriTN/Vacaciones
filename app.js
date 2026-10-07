// Vacaciones GC — interfaz. Toda la lógica de cálculo vive en lib/ (probada con node --test).
import { hoyISO, sumarDias, dow, rango, anioDe, mesDe, MESES, fechaLarga, fechaCorta, rangoTexto, plural, diasEntre, iso } from "./lib/util.mjs";
import { creaFestivos, TIPOS } from "./lib/festivos.mjs";
import * as M from "./lib/motor.mjs";
import { generarICS, eventosVacaciones, eventosFestivos } from "./lib/ics.mjs";

const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "vacgc-v1";
const POR_DEFECTO = {
  ajustes: { diasAnuales: 22, extraAnio: {}, entrantes: {}, guardar: {}, arrastreMax: 5, arrastreCaduca: false, arrastreLimite: "03-31", reserva: {}, gastados: {}, plan: { navidad: "normal", verano: "2", semanaSanta: "no", distribucion: "equilibrada", prioridad: [], mesesVerano: [6, 7, 8, 9] }, semana: [1, 2, 3, 4, 5], jefe: "", empresaDias: [], tema: "auto", repo: "", token: "" },
  marcas: {}, pareja: [],
};
function cargar() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r) return { ...POR_DEFECTO, ...r, ajustes: { ...POR_DEFECTO.ajustes, ...r.ajustes, plan: { ...POR_DEFECTO.ajustes.plan, ...r.ajustes?.plan } } }; } catch {}
  return structuredClone(POR_DEFECTO);
}
let S = cargar();
const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const hoy = hoyISO();
const anioActual = anioDe(hoy);
let anio = anioActual, vista = "inicio";
let DATOS = { anios: {} }, MANUAL = {}, CAMBIOS = { cambios: [] }, SALUD = null, F = null, C = null;
const UI = { herramienta: "V", rangoModo: false, ancla: null, calor: false, calSub: innerWidth < 820 ? "mes" : "anio", descSub: "puentes", mes: mesDe(hoy), puentesMax: 4, soloFuturos: true, planRes: null, planPresupuesto: null, planDesdeHoy: true };

const ICO = {
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  descubrir: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  izq: '<path d="M15 5l-7 7 7 7"/>', der: '<path d="M9 5l7 7-7 7"/>',
};
const NAV = [["inicio", "Inicio"], ["calendario", "Calendario"], ["descubrir", "Descubrir"]];
const svg = (k, c = "") => `<svg class="ico ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

async function json(u, def) { try { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch { return def; } }
function reconstruirCtx() { C = { festivos: F, semana: new Set(S.ajustes.semana), vac: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "V")), bloqueados: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "B")) }; }
const en = (n, u, p) => plural(n, u, p);
const toast = (t) => { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 2600); };
const cuenta = (i) => { const n = diasEntre(hoy, i); return n === 0 ? "hoy" : n === 1 ? "mañana" : n > 0 ? `en ${n} días` : `hace ${-n} días`; };
const pillTipo = (t) => `<span class="pill ${TIPOS[t]?.clase || ""}">${h(TIPOS[t]?.etiqueta || t)}</span>`;
const ddmm = (i) => `${Number(i.slice(8))} ${MESES[mesDe(i) - 1].slice(0, 3)}`;

/* ---------- Saldo con días guardados ---------- */
const limiteEntrantes = (a) => (S.ajustes.arrastreCaduca ? `${a}-${S.ajustes.arrastreLimite || "03-31"}` : null);
function entrantesDe(a) {
  const m = S.ajustes.entrantes?.[a];
  if (m !== undefined && m !== "" && m !== null) return Number(m) || 0;
  if (a <= anioActual) return 0;
  return saldoAnio(a - 1).guardar; // lo que decidiste guardar del año anterior
}
function saldoAnio(a) {
  return M.saldo(C, { diasAnuales: S.ajustes.diasAnuales, extra: Number(S.ajustes.extraAnio?.[a] || 0), entrantes: a <= anioActual && S.ajustes.entrantes?.[a] === undefined ? 0 : entrantesDe(a), limiteEntrantes: limiteEntrantes(a), guardar: Number(S.ajustes.guardar?.[a] || 0), reserva: Number(S.ajustes.reserva?.[a] || 0), gastados: Number(S.ajustes.gastados?.[a] || 0), arrastreMax: Number(S.ajustes.arrastreMax || 0), hoy }, a);
}

/* ---------- Piezas reutilizables ---------- */
function bloqueHTML(b, { botones = "" } = {}) {
  const r = (b.libres / b.coste).toFixed(1).replace(".", ",");
  return `<div class="puente"><div class="fila sp"><strong>${h(rangoTexto(b.ini, b.fin))}</strong><span class="pill ok">×${r}</span></div>
    <div class="peq">Pides <b>${en(b.coste, "día", "días")}</b> y descansas <b>${en(b.libres, "día", "días")} seguidos</b>${b.festivos.length ? ` · ${h([...new Set(b.festivos)].join(", "))}` : ""}</div>
    <div class="dias">${b.pedir.map((d) => `<span>${h(fechaCorta(d))}</span>`).join("")}</div>${botones ? `<div class="fila">${botones}</div>` : ""}</div>`;
}
const estaAplicado = (b) => b.pedir.every((d) => S.marcas[d] === "V");
const seg = (grupo, opciones, actual) => `<div class="seg" role="tablist">${opciones.map(([k, t]) => `<button role="tab" aria-selected="${actual === k}" class="${actual === k ? "on" : ""}" data-act="sub" data-k="${grupo}:${k}">${t}</button>`).join("")}</div>`;
function anillo(sd) {
  const total = Math.max(1, sd.total), usado = Math.min(1, (sd.usados + sd.gastados) / total), r = 54, c = 2 * Math.PI * r;
  return `<div class="anillo"><svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${r}" class="a-fondo"/><circle cx="64" cy="64" r="${r}" class="a-valor" stroke-dasharray="${(usado * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/></svg>
    <div class="a-txt"><b class="num">${sd.restantes}</b><span>restantes</span></div></div>`;
}
function avisosAnio(a) {
  const y = F.anio(a);
  if (y.estado !== "oficial") return `<div class="card aviso"><h3>Calendario de ${a}: ${y.estado === "parcial" ? "parcial" : "estimado"}</h3><p class="peq mut">${h(y.fuente)}</p>${y.notas.map((n) => `<p class="peq">${h(n)}</p>`).join("")}<p class="peq mut">Se actualiza solo cada día; si cambia algo, te lo aviso aquí.</p></div>`;
  return y.notas.map((n) => `<div class="card aviso"><p class="peq">⚠ ${h(n)}</p></div>`).join("");
}
function avisosConflicto() {
  const k = M.conflictos(C).filter((x) => anioDe(x.fecha) === anio);
  if (!k.length) return "";
  return `<div class="card error"><h3>Revisa estos días</h3><ul class="lista">${k.map((x) => `<li><span>${h(fechaLarga(x.fecha))}: ${h(x.motivo)}</span><button class="btn chico" data-act="quitar-dia" data-d="${x.fecha}">Liberar</button></li>`).join("")}</ul></div>`;
}
function cambiosRecientes() {
  const lim = sumarDias(hoy, -120), lista = (CAMBIOS.cambios || []).filter((c) => c.detectado >= lim).slice(-4).reverse();
  if (!lista.length) return "";
  return `<div class="card"><h3>Cambios recientes en los festivos</h3>${lista.map((c) => `<p class="peq"><b>${c.anio}</b> · detectado ${h(fechaCorta(c.detectado))}</p><ul class="lista peq">${[
    ...c.anadidos.map((x) => `<li>➕ ${h(fechaLarga(x.fecha))}: ${h(x.nombre)}</li>`), ...c.quitados.map((x) => `<li>➖ ${h(fechaLarga(x.fecha))}: ${h(x.nombre)}</li>`),
    ...c.renombrados.map((x) => `<li>✏️ ${h(fechaLarga(x.fecha))}: ${h(x.antes)} → ${h(x.ahora)}</li>`)].join("")}</ul>`).join("")}</div>`;
}

/* ---------- INICIO ---------- */
function vInicio() {
  const sd = saldoAnio(anio), desde = anio === anioActual ? hoy : null, fin = `${anio}-12-31`;
  const quedan = anio === anioActual ? rango(hoy, fin).filter((d) => M.esLaborable(C, d) && !C.vac.has(d) && !C.bloqueados.has(d)).length : null;
  const alertas = [];
  if (sd.entrantesEnRiesgo > 0 && sd.limiteEntrantes >= hoy) alertas.push(`<div class="alerta"><b>${en(sd.entrantesEnRiesgo, "día guardado caduca", "días guardados caducan")} el ${h(fechaLarga(sd.limiteEntrantes))}</b><span>${cuenta(sd.limiteEntrantes)} · aún no los has planificado.</span><button class="btn chico pri" data-act="plan-arrastre">Colocarlos</button></div>`);
  if (sd.caducados > 0) alertas.push(`<div class="alerta mala"><b>Se perdieron ${en(sd.caducados, "día guardado", "días guardados")}</b><span>No se usaron antes del ${h(fechaLarga(sd.limiteEntrantes))}.</span></div>`);
  if (quedan !== null && sd.aUsar > 0 && quedan <= sd.aUsar * 2.5) alertas.push(`<div class="alerta"><b>Te sobran ${en(sd.aUsar, "día", "días")} y quedan ${en(quedan, "laborable", "laborables")} este año</b><span>${sd.guardables > 0 ? `Puedes guardar hasta ${sd.guardables} para ${anio + 1}.` : "Si no los usas, se pierden."}</span><button class="btn chico pri" data-act="ir-plan">Repartir</button></div>`);
  const pts = M.puentes(C, anio, { maxCoste: 3, desde, limite: 3 });
  const proxF = M.proximos(F, desde || iso(anio, 1, 1), 4);
  const sig = M.bloquesActuales(C, anio).filter((b) => b.fin >= hoy)[0];
  const stepper = (txt, ayuda, n, menos, mas, dis) => `<div class="stepper-fila"><span class="peq">${txt} <span class="mut">${ayuda}</span></span><div class="stepper"><button data-act="${menos}" aria-label="Menos" ${n <= 0 ? "disabled" : ""}>−</button><b class="num">${n}</b><button data-act="${mas}" aria-label="Más" ${dis ? "disabled" : ""}>+</button></div></div>`;
  const reservaUI = stepper("Reserva para imprevistos", "(no se planifican)", sd.reserva, "reserva-menos", "reserva-mas", sd.reserva >= sd.restantes - sd.guardar);
  const gastadosUI = stepper("Ya disfrutados este año", "(antes de usar la app)", sd.gastados, "gastados-menos", "gastados-mas", false);
  const guardarUI = gastadosUI + (S.ajustes.arrastreMax > 0 ? stepper(`Guardar para ${anio + 1}`, `(máx. ${S.ajustes.arrastreMax})`, sd.guardar, "guardar-menos", "guardar-mas", sd.guardar >= sd.guardables) : "") + reservaUI;
  return `<div class="stack">
  <section class="card hero"><div class="hero-in">${anillo(sd)}<div class="hero-txt"><h2>${anio === anioActual ? "Tus vacaciones" : `Vacaciones ${anio}`}</h2>
      <p class="peq mut">${en(sd.usados, "día pedido", "días pedidos")}${sd.gastados ? ` + ${sd.gastados} ya disfrutados` : ""} de ${sd.total}${sd.reserva ? ` · ${sd.reserva} en reserva` : ""}${sd.entrantes ? ` · incluye <b>${sd.entrantes}</b> guardados de ${anio - 1}` : ""}</p>
      ${sd.restantes < 0 ? `<p class="peq" style="color:var(--err)"><b>Te pasas ${-sd.restantes} del saldo</b></p>` : ""}
      <div class="fila"><button class="btn pri" data-act="ir-plan">Generar plan</button><button class="btn" data-act="ir-cal">Mi calendario</button></div></div></div>${guardarUI}</section>
  ${alertas.join("")}
  <div class="grid">
    <div class="card"><h3>${sig ? "Próximas vacaciones" : "Aún sin vacaciones elegidas"}</h3>${sig ? `${bloqueHTML(sig)}<p class="peq mut">${cuenta(sig.ini)}</p>` : `<p class="peq mut">Marca días en el calendario o aplica un plan.</p>`}</div>
    <div class="card"><h3>Mejores puentes ${desde ? "que vienen" : "del año"}</h3>${pts.length ? pts.map((b, i) => bloqueHTML(b, { botones: `<button class="btn chico ${estaAplicado(b) ? "" : "pri"}" data-act="toggle-puente" data-k="${i}" data-src="inicio">${estaAplicado(b) ? "Quitar" : "Añadir"}</button>` })).join("<hr>") : `<p class="peq mut">No quedan puentes rentables con ≤3 días.</p>`}
      <button class="btn chico" style="margin-top:10px" data-act="ir-puentes">Ver todos</button></div>
    <div class="card"><h3>Próximos festivos</h3><ul class="lista">${proxF.map((f) => `<li><span>${h(fechaLarga(f.fecha))}<br><span class="peq mut">${h(f.nombre)}</span></span><span class="peq mut">${cuenta(f.fecha)}</span></li>`).join("") || "<li class='mut'>Sin festivos próximos</li>"}</ul></div>
    ${avisosConflicto()}${avisosAnio(anio)}${cambiosRecientes()}
  </div></div>`;
}

/* ---------- CALENDARIO ---------- */
function celdasMes(a, m) {
  const primero = iso(a, m, 1), n = new Date(Date.UTC(a, m, 0)).getUTCDate(), off = (dow(primero) + 6) % 7;
  const celdas = [...Array(off).fill('<span class="d vacio"></span>')], parejaSet = new Set(S.pareja);
  for (let d = 1; d <= n; d++) {
    const i = iso(a, m, d), f = F.get(i), cl = ["d"];
    if (!S.ajustes.semana.includes(dow(i))) cl.push("fin");
    if (f) cl.push("f", TIPOS[f.tipo]?.clase || "");
    const mk = S.marcas[i]; if (mk) cl.push(mk);
    if (parejaSet.has(i)) cl.push("P");
    if (i === hoy) cl.push("hoy"); else if (i < hoy) cl.push("pasado");
    if (UI.calor && i >= hoy && !f && !mk && M.esLaborable(C, i)) { const v = M.valorDia(C, i); if (v >= 4) cl.push(`h${Math.min(5, v - 1)}`); }
    const tip = `${fechaLarga(i)}${f ? " · " + f.nombre : ""}${mk === "V" ? " · vacaciones" : mk === "B" ? " · no disponible" : ""}${parejaSet.has(i) ? " · pareja" : ""}`;
    celdas.push(`<button class="${cl.join(" ")}" data-act="dia" data-d="${i}" title="${h(tip)}" aria-label="${h(tip)}">${d}</button>`);
  }
  return `<div class="sem"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="cuad">${celdas.join("")}</div>`;
}
const mesPeq = (a, m) => `<div class="mes"><h4>${MESES[m - 1]}</h4>${celdasMes(a, m)}</div>`;
function barraHerramientas() {
  const herr = [["V", "Vacaciones"], ["B", "No disponible"], ["P", "Pareja"], ["X", "Borrar"]];
  return `<div class="toolbar noprint"><div class="chips">${herr.map(([k, t]) => `<button class="chip ${UI.herramienta === k ? "on" : ""}" data-act="herr" data-k="${k}">${t}</button>`).join("")}</div>
    <div class="chips"><button class="chip ${UI.rangoModo ? "on" : ""}" data-act="rango">${UI.rangoModo ? (UI.ancla ? "Toca el último día" : "Toca el primer día") : "Rango"}</button>
    <button class="chip ${UI.calor ? "on" : ""}" data-act="calor" title="Colorea cada día según los días seguidos libres que lograrías pidiéndolo">Mapa de calor</button></div></div>`;
}
const leyenda = () => `<div class="leyenda"><span><i style="background:var(--nac)"></i>Nacional</span><span><i style="background:var(--can)"></i>Canarias</span><span><i style="background:var(--isl)"></i>Gran Canaria</span><span><i style="background:var(--loc)"></i>Las Palmas</span><span><i style="background:var(--emp)"></i>Empresa</span><span><i style="background:var(--vac)"></i>Vacaciones</span><span><i style="background:repeating-linear-gradient(45deg,var(--blq),var(--blq) 3px,transparent 3px,transparent 6px)"></i>No disponible</span><span><i style="border:2px solid var(--par)"></i>Pareja</span></div>`;
function bloquesCard() {
  const bl = M.bloquesActuales(C, anio), comun = S.pareja.filter((d) => anioDe(d) === anio && (C.vac.has(d) || !M.esLaborable(C, d))).length;
  return `<div class="card"><div class="fila sp"><h3>Mis bloques de vacaciones</h3><div class="fila noprint"><button class="btn chico" data-act="solicitud">Copiar solicitud</button><button class="btn chico" data-act="ics-mio">.ics</button><button class="btn chico" data-act="imprimir">Imprimir</button></div></div>
    ${bl.length ? `<div class="grid">${bl.map((b) => `<div>${bloqueHTML(b)}</div>`).join("")}</div><button class="btn chico peligro" style="margin-top:10px" data-act="borrar-vac">Borrar vacaciones ${anio}</button>` : `<p class="peq mut">Todavía no has marcado ningún día.</p>`}
    ${S.pareja.length ? `<p class="peq">💞 Días libres en común con tu pareja: <b>${comun}</b> de ${S.pareja.filter((d) => anioDe(d) === anio).length}.</p>` : ""}</div>`;
}
function vCalendario() {
  const cab = seg("cal", [["mes", "Mes"], ["anio", "Año"], ["festivos", "Festivos"]], UI.calSub);
  if (UI.calSub === "festivos") return `<div class="stack">${cab}${vFestivos()}</div>`;
  const sd = saldoAnio(anio);
  let cuerpo;
  if (UI.calSub === "mes") {
    const m = UI.mes, lista = F.anio(anio).lista.filter((f) => mesDe(f.fecha) === m);
    cuerpo = `<div class="mes grande"><div class="fila sp mes-nav"><button class="ibtn" data-act="mes-nav" data-k="-1" aria-label="Mes anterior">${svg("izq")}</button><h3>${MESES[m - 1]} ${anio}</h3><button class="ibtn" data-act="mes-nav" data-k="1" aria-label="Mes siguiente">${svg("der")}</button></div>${celdasMes(anio, m)}</div>
      ${lista.length ? `<div class="card"><h3>Festivos de ${MESES[m - 1]}</h3><ul class="lista">${lista.map((f) => `<li><span>${h(fechaLarga(f.fecha))}<br><span class="peq mut">${h(f.nombre)}</span></span>${pillTipo(f.tipo)}</li>`).join("")}</ul></div>` : ""}`;
  } else cuerpo = `<div class="meses">${Array.from({ length: 12 }, (_, k) => mesPeq(anio, k + 1)).join("")}</div>`;
  return `<div class="stack">${cab}${barraHerramientas()}<div class="peq mut fila sp"><span>Toca un día para marcarlo; festivos y fines de semana son libres y no gastan.</span><span><b>${sd.restantes}</b> de ${sd.total} restantes</span></div>${leyenda()}${cuerpo}${bloquesCard()}${avisosConflicto()}</div>`;
}

/* ---------- DESCUBRIR (puentes + plan) ---------- */
function vPuentes() {
  const desde = UI.soloFuturos && anio === anioActual ? hoy : null;
  const lista = M.puentes(C, anio, { maxCoste: UI.puentesMax, desde, limite: 40 });
  UI.lastPuentes = lista;
  return `<p class="sub">Combinaciones de pocos días con festivos y fines de semana, ordenadas por rendimiento (días libres seguidos por cada día pedido).</p>
  <div class="card"><div class="form"><label class="campo">Máximo de días a pedir: <b>${UI.puentesMax}</b><input type="range" min="1" max="8" value="${UI.puentesMax}" data-ui="puentesMax"></label>
  ${anio === anioActual ? `<label class="campo fila"><input type="checkbox" ${UI.soloFuturos ? "checked" : ""} data-ui="soloFuturos" style="width:22px;height:22px"><span>Solo los que aún no han pasado</span></label>` : ""}</div></div>
  <div class="grid">${lista.map((b, i) => `<div class="card">${bloqueHTML(b, { botones: `<button class="btn chico ${estaAplicado(b) ? "" : "pri"}" data-act="toggle-puente" data-k="${i}" data-src="puentes">${estaAplicado(b) ? "Quitar de mi plan" : "Añadir a mi plan"}</button>` })}</div>`).join("") || `<div class="card"><p class="mut">No hay puentes que cumplan el filtro.</p></div>`}</div>`;
}
function planCard(clave, r) {
  const d = M.DISTRIBUCIONES[clave], rend = r.coste ? (r.libres / r.coste).toFixed(2).replace(".", ",") : "–", mia = S.ajustes.plan.distribucion === clave;
  return `<div class="card plan ${mia ? "elegida" : ""}"><div class="fila sp"><h3>${h(d.nombre)}${mia ? ' <span class="pill">tu elección</span>' : ""}</h3><span class="pill ok">×${rend}</span></div><p class="peq mut">${h(d.desc)}</p>
    <p class="peq"><b>${en(r.coste, "día", "días")}</b> pedidos · <b>${r.libres}</b> días libres en ${en(r.bloques.length, "bloque", "bloques")}${r.sinAsignar > 0 ? ` · <span style="color:var(--warn)">${r.sinAsignar} sin asignar</span>` : ""}</p>
    ${r.anclasPedidas && r.anclasCumplidas < r.anclasPedidas ? `<p class="peq" style="color:var(--warn)">⚠ ${h(motivoAnclas(r))}</p>` : ""} chico" data-act="aplicar-plan" data-k="${clave}">Aplicar a mi calendario</button></div></div>`;
}
const opcion = (g, k, t, actual) => `<button class="chip ${actual === k ? "on" : ""}" data-act="pref" data-k="${g}:${k}">${t}</button>`;
const multi = (g, k, t, lista) => `<button class="chip ${lista.includes(k) ? "on" : ""}" data-act="pref" data-k="${g}:${k}">${t}</button>`;
function vPlan() {
  const sd = saldoAnio(anio), p = S.ajustes.plan, pres = UI.planPresupuesto ?? Math.max(0, sd.aUsar);
  const reservas = [0, 1, 2, 3, 5];
  return `<p class="sub">Dime cómo quieres tus vacaciones y comparo tres formas de repartirlas. Respeta lo ya marcado y tus días no disponibles${sd.entrantesEnRiesgo > 0 && sd.limiteEntrantes >= hoy ? `; coloca antes del ${h(fechaLarga(sd.limiteEntrantes))} tus ${sd.entrantesEnRiesgo} días guardados` : ""}.</p>
  <div class="card opciones">
    <div class="opc"><h4>Navidades</h4><div class="chips">${opcion("navidad", "no", "No me importa", p.navidad)}${opcion("navidad", "normal", "Normales (3–5 días)", p.navidad)}${opcion("navidad", "larga", "Largas (6–9 días)", p.navidad)}</div></div>
    <div class="opc"><h4>Verano</h4><div class="chips">${opcion("verano", "no", "Sin bloque", p.verano)}${opcion("verano", "1", "1 semana", p.verano)}${opcion("verano", "2", "2 semanas", p.verano)}${opcion("verano", "3", "3 semanas", p.verano)}</div>
      ${p.verano !== "no" ? `<div class="chips pequeno">${MESES.map((m, k) => multi("mesesVerano", k + 1, m.slice(0, 3), p.mesesVerano)).join("")}</div>` : ""}</div>
    <div class="opc"><h4>Semana Santa</h4><div class="chips">${opcion("semanaSanta", "no", "No", p.semanaSanta)}${opcion("semanaSanta", "si", "Aprovecharla", p.semanaSanta)}</div></div>
    <div class="opc"><h4>Distribución</h4><div class="chips">${Object.entries(M.DISTRIBUCIONES).map(([k, d]) => opcion("distribucion", k, d.nombre, p.distribucion)).join("")}</div><p class="peq mut">${h(M.DISTRIBUCIONES[p.distribucion].desc)}</p></div>
    <div class="opc"><h4>Dar más peso a</h4><div class="chips">${multi("prioridad", "verano", "Verano", p.prioridad)}${multi("prioridad", "navidad", "Navidad y Reyes", p.prioridad)}${multi("prioridad", "semanasanta", "Semana Santa", p.prioridad)}</div></div>
    <div class="opc"><h4>Reserva para imprevistos</h4><div class="chips">${reservas.map((n) => `<button class="chip ${sd.reserva === n ? "on" : ""}" data-act="reserva-fija" data-k="${n}">${n === 0 ? "Ninguna" : n + (n === 1 ? " día" : " días")}</button>`).join("")}</div><p class="peq mut">Esos días no se planifican: quedan libres por si surge algo.</p></div>
    <div class="form"><label class="campo">Días a repartir<input type="number" min="1" max="60" value="${pres}" data-ui="planPresupuesto"></label>
      ${anio === anioActual ? `<label class="check"><input type="checkbox" ${UI.planDesdeHoy ? "checked" : ""} data-ui="planDesdeHoy"><span>Solo desde hoy</span></label>` : ""}</div>
    ${sd.guardar || sd.reserva ? `<p class="peq mut">De ${sd.restantes} restantes: ${sd.guardar ? `${sd.guardar} guardados para ${anio + 1}` : ""}${sd.guardar && sd.reserva ? " y " : ""}${sd.reserva ? `${sd.reserva} de reserva` : ""}; salen ${sd.aUsar} para planificar.</p>` : ""}
    <div class="fila"><button class="btn pri" data-act="calcular-plan">Calcular planes</button></div></div>
  <div class="grid">${UI.planRes ? Object.entries(UI.planRes).map(([k, r]) => planCard(k, r)).join("") : `<div class="card"><p class="mut">Ajusta tus preferencias y pulsa «Calcular planes».</p></div>`}</div>
  ${UI.planRes ? `<p class="peq mut">×N = días libres seguidos por cada día de vacaciones. El plan nunca gasta más de lo indicado.</p>` : ""}`;
}
const vDescubrir = () => `<div class="stack">${seg("desc", [["puentes", "Puentes"], ["plan", "Plan automático"]], UI.descSub)}${UI.descSub === "plan" ? vPlan() : vPuentes()}</div>`;

/* ---------- FESTIVOS (dentro de Calendario) ---------- */
function vFestivos() {
  const y = F.anio(anio), lista = y.lista, res = M.resumenAnio(C, anio, lista);
  const est = { oficial: ["ok", "Oficial"], parcial: ["warn", "Parcial"], estimado: ["warn", "Estimado"] }[y.estado] || ["warn", y.estado];
  return `<div class="card"><div class="fila sp"><h3>Festivos ${anio} · Las Palmas de Gran Canaria</h3><span class="pill ${est[0]}">${est[1]}</span></div><p class="peq mut">${h(y.fuente)}</p>${y.notas.map((n) => `<p class="peq">⚠ ${h(n)}</p>`).join("")}
  <p class="peq">${en(lista.length, "festivo", "festivos")}: <b>${res.enSemana}</b> caen en día laborable y <b>${res.perdidos.length}</b> en fin de semana${res.perdidos.length ? ` (${res.perdidos.map((f) => h(fechaCorta(f.fecha))).join(", ")})` : ""}.</p>
  <div class="fila noprint"><a class="btn chico" href="data/calendario.ics">Suscribirse (.ics)</a><button class="btn chico" data-act="ics-festivos">Descargar ${anio}</button></div></div>
  <div class="card"><table class="t"><tbody>${lista.map((f) => `<tr class="${f.fecha < hoy ? "pasado" : ""}"><td class="num">${h(fechaLarga(f.fecha))}</td><td>${h(f.nombre)}${f.nota ? `<br><span class="peq mut">${h(f.nota)}</span>` : ""}${f.pendienteBOC ? `<br><span class="peq" style="color:var(--warn)">Pendiente de publicar en el BOC</span>` : ""}</td><td>${pillTipo(f.tipo)}</td><td class="peq mut">${S.ajustes.semana.includes(dow(f.fecha)) ? cuenta(f.fecha) : "fin de semana"}</td></tr>`).join("")}</tbody></table></div>
  ${cambiosRecientes()}${SALUD?.lecturas?.length ? `<div class="card"><details><summary>Estado de las lecturas oficiales</summary><ul class="lista peq" style="margin-top:8px">${SALUD.lecturas.map((l) => `<li><span>${l.ok ? "✔" : "✖"} ${h(l.nombre)}</span><span class="mut">${h(l.detalle || "")}</span></li>`).join("")}</ul><p class="peq mut">Última lectura: ${h(SALUD.generado || "nunca")}</p></details></div>` : ""}`;
}

/* ---------- AJUSTES ---------- */
function vAjustes() {
  const a = S.ajustes, extra = Number(a.extraAnio?.[anio] || 0), sd = saldoAnio(anio);
  const dsem = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
  const entManual = a.entrantes?.[anio];
  return `<div class="stack"><div class="fila sp"><div><h2>Ajustes</h2><p class="sub" style="margin:0">Todo se guarda en este dispositivo.</p></div></div>
  <div class="grid">
  <div class="card"><h3>Tus días</h3><div class="form"><label class="campo">Días de vacaciones al año<input type="number" min="0" max="60" value="${a.diasAnuales}" data-set="diasAnuales"></label>
    <label class="campo">Ya disfrutados en ${anio} (sin marcar en el calendario)<input type="number" min="0" max="60" value="${Number(a.gastados?.[anio] || 0)}" data-set="gastados"></label>
    <label class="campo">Extra en ${anio} (asuntos propios…)<input type="number" min="-30" max="60" value="${extra}" data-set="extraAnio"></label></div>
    <p class="peq" style="margin:12px 0 6px"><b>Días que trabajas</b></p><div class="chips">${dsem.map(([k, t]) => `<button class="chip ${a.semana.includes(k) ? "on" : ""}" data-act="sem" data-k="${k}">${t}</button>`).join("")}</div></div>
  <div class="card"><h3>Días sin disfrutar</h3><p class="peq mut">Si tu empresa deja guardar días al año siguiente, indícalo aquí. Si tu empresa los hace caducar, actívalo y pon la fecha; si no, quedan sin límite.</p>
    <div class="form"><label class="campo">Máximo que se puede guardar<input type="number" min="0" max="30" value="${a.arrastreMax}" data-set="arrastreMax"></label>
    <label class="check"><input type="checkbox" ${a.arrastreCaduca ? "checked" : ""} data-set="arrastreCaduca"> Los días guardados caducan</label>
    ${a.arrastreCaduca ? `<label class="campo">Caducan el (del año siguiente)<input type="date" value="${anioActual + 1}-${a.arrastreLimite}" data-set="arrastreLimite"></label>` : ""}
    <label class="campo">Guardados que traigo a ${anio}<input type="number" min="0" max="60" value="${entManual ?? (anio > anioActual ? sd.entrantes : 0)}" data-set="entrantes"></label></div>
    <p class="peq mut" style="margin-top:8px">Pon 0 en el máximo si tu empresa no lo permite. Para ${anio + 1}, los guardados salen de lo que reserves en Inicio.</p></div>
  <div class="card"><h3>Solicitud y apariencia</h3><label class="campo">A quién envías la solicitud<input type="text" value="${h(a.jefe)}" data-set="jefe" placeholder="nombre (opcional)"></label>
    <label class="campo" style="margin-top:10px">Tema<select data-set="tema"><option value="auto" ${a.tema === "auto" ? "selected" : ""}>Automático</option><option value="claro" ${a.tema === "claro" ? "selected" : ""}>Claro</option><option value="oscuro" ${a.tema === "oscuro" ? "selected" : ""}>Oscuro</option></select></label></div>
  <div class="card"><h3>Días de empresa</h3><p class="peq mut">Cierres o festivos propios (24 y 31 dic, patrón…). No gastan vacaciones.</p>
    <ul class="lista peq">${a.empresaDias.map((d, k) => `<li><span>${h(fechaLarga(d.fecha))} · ${h(d.nombre)}</span><button class="btn chico peligro" data-act="del-empresa" data-k="${k}">Quitar</button></li>`).join("")}</ul>
    <div class="fila" style="margin-top:8px"><input type="date" id="empFecha" style="flex:1;min-width:130px"><input type="text" id="empNombre" placeholder="Nombre" style="flex:1;min-width:110px"><button class="btn chico" data-act="add-empresa">Añadir</button></div></div>
  <div class="card"><h3>Copia y pareja</h3><div class="fila"><button class="btn chico" data-act="exportar">Exportar mis datos</button><label class="btn chico">Importar<input type="file" accept="application/json" data-file="importar" hidden></label></div>
    <p class="peq mut" style="margin-top:10px">Importa el archivo exportado de tu pareja para ver sus vacaciones y los días libres en común.</p>
    <div class="fila"><label class="btn chico">Importar a mi pareja<input type="file" accept="application/json" data-file="pareja" hidden></label>${S.pareja.length ? `<button class="btn chico peligro" data-act="quitar-pareja">Quitar</button>` : ""}</div></div>
  <div class="card"><h3>Sincronizar con GitHub (opcional)</h3><p class="peq mut">Guarda tus marcas en <code>data/mis-vacaciones.json</code> de tu repositorio. Con repositorio público, cualquiera podría leerlas.</p>
    <div class="form"><label class="campo">Repositorio<input type="text" value="${h(a.repo)}" data-set="repo" placeholder="usuario/Vacaciones"></label><label class="campo">Token (Contents: read & write)<input type="password" value="${h(a.token)}" data-set="token" autocomplete="off"></label></div>
    <div class="fila" style="margin-top:10px"><button class="btn chico" data-act="sync-subir">Subir</button><button class="btn chico" data-act="sync-bajar">Bajar</button></div></div>
  <div class="card"><h3>Datos</h3><p class="peq mut">Festivos cargados: ${Object.keys(DATOS.anios || {}).join(", ") || "reglas internas"}. Versión: ${h(DATOS.generado?.slice(0, 10) || "—")}.</p><div class="fila"><button class="btn chico" data-act="recargar">Buscar actualización</button><button class="btn chico peligro" data-act="reset">Borrar todo</button></div></div>
  </div></div>`;
}

/* ---------- Render y navegación ---------- */
const FN = { inicio: vInicio, calendario: vCalendario, descubrir: vDescubrir, ajustes: vAjustes };
function aplicarTema() { const t = S.ajustes.tema; if (t === "auto") delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t; }
const navHTML = () => NAV.map(([k, t]) => `<button class="nav ${vista === k ? "on" : ""}" data-go="${k}" ${vista === k ? 'aria-current="page"' : ""}>${svg(k)}<span>${t}</span></button>`).join("");
function render({ conservarScroll = true } = {}) {
  const y = window.scrollY; reconstruirCtx();
  $("#side").innerHTML = `<div class="marca"><img src="icon-192.png" alt="">Vacaciones GC</div>${navHTML()}<div class="relleno"></div><button class="nav ${vista === "ajustes" ? "on" : ""}" data-go="ajustes">${svg("ajustes")}<span>Ajustes</span></button>`;
  $("#tabs").innerHTML = navHTML();
  $("#titulo").textContent = vista === "ajustes" ? "Ajustes" : "Vacaciones GC";
  $("#anioNav").innerHTML = `<button class="ibtn" data-act="anio-nav" data-k="-1" aria-label="Año anterior" ${anio <= anioActual ? "disabled" : ""}>${svg("izq")}</button><b class="num">${anio}</b><button class="ibtn" data-act="anio-nav" data-k="1" aria-label="Año siguiente" ${anio >= anioActual + 2 ? "disabled" : ""}>${svg("der")}</button>`;
  $("#bAjustes").className = `ibtn ${vista === "ajustes" ? "on" : ""}`; $("#bAjustes").innerHTML = svg("ajustes");
  $("#vista").innerHTML = FN[vista]();
  if (conservarScroll) window.scrollTo(0, y);
}
function ir(v) { vista = v; if (location.hash !== `#/${v}`) history.replaceState(null, "", `#/${v}`); render({ conservarScroll: false }); window.scrollTo(0, 0); }

/* ---------- Acciones ---------- */
const poner = (d, t) => { if (t === "P") { if (!S.pareja.includes(d)) S.pareja.push(d); } else if (t === "X") { delete S.marcas[d]; S.pareja = S.pareja.filter((x) => x !== d); } else if (t !== "V" || M.esLaborable(C, d)) S.marcas[d] = t; };
function alternar(d) {
  const t = UI.herramienta;
  if (t === "P") S.pareja = S.pareja.includes(d) ? S.pareja.filter((x) => x !== d) : [...S.pareja, d];
  else if (t === "X") poner(d, "X");
  else if (t === "V" && !M.esLaborable(C, d)) toast(F.get(d) ? `Ya es festivo: ${F.get(d).nombre}` : "Ya es un día libre");
  else if (S.marcas[d] === t) delete S.marcas[d]; else S.marcas[d] = t;
}
const marcarBloque = (b) => b.pedir.forEach((d) => (S.marcas[d] = "V"));
const desmarcarBloque = (b) => b.pedir.forEach((d) => { if (S.marcas[d] === "V") delete S.marcas[d]; });
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo })), a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function copiar(texto) { try { await navigator.clipboard.writeText(texto); return true; } catch { return false; } }
function textoSolicitud() {
  const bl = M.bloquesActuales(C, anio);
  if (!bl.length) return "";
  const l = bl.map((b) => `- ${b.pedir.length === 1 ? fechaLarga(b.pedir[0]) : `del ${fechaLarga(b.pedir[0])} al ${fechaLarga(b.pedir[b.pedir.length - 1])}`} (${en(b.coste, "día laborable", "días laborables")})`);
  return `Hola${S.ajustes.jefe ? " " + S.ajustes.jefe : ""},\n\nQuería solicitar estas vacaciones de ${anio}:\n${l.join("\n")}\n\nTotal: ${en(bl.reduce((s, b) => s + b.coste, 0), "día laborable", "días laborables")}. Dime si hay algún problema con esas fechas.\n\nGracias.`;
}
const datosExport = () => ({ version: 2, exportado: new Date().toISOString(), marcas: S.marcas, pareja: S.pareja, ajustes: { ...S.ajustes, token: "", repo: "" } });
const b64 = (s) => btoa(unescape(encodeURIComponent(s))), deb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
async function sync(dir) {
  const { repo, token } = S.ajustes; if (!repo || !token) return toast("Rellena repositorio y token en Ajustes");
  const url = `https://api.github.com/repos/${repo}/contents/data/mis-vacaciones.json`, cab = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const r = await fetch(url, { headers: cab }); const existe = r.ok ? await r.json() : null;
    if (dir === "bajar") {
      if (!existe) return toast("No hay datos subidos todavía");
      const d = JSON.parse(deb64(existe.content)); S.marcas = d.marcas || {}; S.pareja = d.pareja || []; S.ajustes = { ...S.ajustes, ...d.ajustes, token: S.ajustes.token, repo: S.ajustes.repo };
      guardar(); aplicarTema(); render(); return toast("Datos descargados");
    }
    const p = await fetch(url, { method: "PUT", headers: cab, body: JSON.stringify({ message: "Vacaciones: actualizar plan", content: b64(JSON.stringify(datosExport(), null, 1)), ...(existe ? { sha: existe.sha } : {}) }) });
    toast(p.ok ? "Datos subidos" : `No se pudo subir (${p.status})`);
  } catch { toast("Sin conexión con GitHub"); }
}
async function cargarDatos() {
  [DATOS, MANUAL, CAMBIOS, SALUD] = await Promise.all([json("data/festivos.json", { anios: {} }), json("data/manual.json", {}), json("data/cambios.json", { cambios: [] }), json("data/salud.json", null)]);
  F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias);
}
const VERANO_DIAS = { 1: [4, 6], 2: [9, 11], 3: [14, 16] };
const NAVIDAD_DIAS = { normal: [3, 5], larga: [6, 9] };
function anclasDePrefs(a) {
  const p = S.ajustes.plan, out = [];
  if (p.verano !== "no") { const [min, max] = VERANO_DIAS[p.verano]; out.push({ id: "verano", min, max, meses: p.mesesVerano.length ? p.mesesVerano : [6, 7, 8, 9] }); }
  if (p.navidad !== "no") { const [min, max] = NAVIDAD_DIAS[p.navidad]; out.push({ id: "navidad", min, max, filtro: (b) => b.pedir.some((d) => d >= `${a}-12-21`) && b.fin >= `${a}-12-26` }); }
  if (p.semanaSanta === "si") out.push({ id: "semanasanta", min: 1, max: 4, filtro: (b) => b.festivos.some((f) => /Jueves Santo|Viernes Santo/.test(f)) });
  return out;
}
function pesosDePrefs() {
  const p = S.ajustes.plan, w = {}, sube = (ms) => ms.forEach((m) => (w[m] = Math.max(w[m] || 1, 1.6)));
  if (p.prioridad.includes("verano")) sube(p.mesesVerano); if (p.prioridad.includes("navidad")) sube([12, 1]); if (p.prioridad.includes("semanasanta")) sube([3, 4]);
  return w;
}
function calcularPlanes() {
  reconstruirCtx();
  const sd = saldoAnio(anio), presupuesto = UI.planPresupuesto ?? Math.max(0, sd.aUsar), desde = UI.planDesdeHoy && anio === anioActual ? hoy : null;
  const riesgo = sd.limiteEntrantes >= hoy || anio > anioActual ? sd.entrantesEnRiesgo : 0;
  const anclas = anclasDePrefs(anio), pesos = pesosDePrefs();
  UI.planRes = {};
  for (const [clave, d] of Object.entries(M.DISTRIBUCIONES)) UI.planRes[clave] = M.planConArrastre(C, anio, { ...d, anclas, pesos, presupuesto, desde, riesgo, limite: sd.limiteEntrantes });
}
const NOM_ANCLA = { verano: "el verano", navidad: "las navidades", semanasanta: "la Semana Santa" };
function motivoAnclas(r) {
  const nombres = (r.anclasNo || []).map((id) => NOM_ANCLA[id] || id), p = S.ajustes.plan;
  const finVerano = `${anio}-${String(Math.max(...(p.mesesVerano.length ? p.mesesVerano : [9]))).padStart(2, "0")}-30`;
  const pasado = UI.planDesdeHoy && anio === anioActual && (r.anclasNo || []).includes("verano") && hoy > finVerano;
  if (pasado) return "El verano que pediste ya pasó este año; desmarca «Solo desde hoy» o planifica el año siguiente.";
  return `No cabe ${nombres.join(" ni ") || "alguna preferencia"} con los días y bloques de este plan. Prueba con más días o una distribución más concentrada.`;
}
const cambiarGuardar = (d) => { const sd = saldoAnio(anio); S.ajustes.guardar = { ...S.ajustes.guardar, [anio]: Math.max(0, Math.min(sd.guardables, sd.guardar + d)) }; guardar(); render(); };
const cambiarReserva = (d, valor = null) => { const sd = saldoAnio(anio); S.ajustes.reserva = { ...S.ajustes.reserva, [anio]: Math.max(0, Math.min(sd.restantes - sd.guardar, valor ?? sd.reserva + d)) }; guardar(); UI.planPresupuesto = null; render(); };

document.addEventListener("click", async (e) => {
  const go = e.target.closest("[data-go]"); if (go) return ir(go.dataset.go);
  if (e.target.closest("#bAjustes")) return ir("ajustes");
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act, k = b.dataset.k, d = b.dataset.d;
  switch (a) {
    case "sub": { const [g, v] = k.split(":"); if (g === "cal") UI.calSub = v; else UI.descSub = v; render({ conservarScroll: false }); break; }
    case "anio-nav": anio = Math.max(anioActual, Math.min(anioActual + 2, anio + Number(k))); UI.mes = anio === anioActual ? mesDe(hoy) : 1; UI.planRes = null; render(); break;
    case "mes-nav": UI.mes += Number(k); if (UI.mes < 1) { UI.mes = 12; if (anio > anioActual) anio -= 1; else UI.mes = 1; } else if (UI.mes > 12) { UI.mes = 1; if (anio < anioActual + 2) anio += 1; else UI.mes = 12; } render(); break;
    case "ir-plan": UI.descSub = "plan"; ir("descubrir"); break;
    case "ir-puentes": UI.descSub = "puentes"; ir("descubrir"); break;
    case "ir-cal": ir("calendario"); break;
    case "plan-arrastre": UI.descSub = "plan"; UI.planPresupuesto = null; calcularPlanes(); ir("descubrir"); break;
    case "gastados-mas": case "gastados-menos": { const n = Math.max(0, Number(S.ajustes.gastados?.[anio] || 0) + (a === "gastados-mas" ? 1 : -1)); S.ajustes.gastados = { ...S.ajustes.gastados, [anio]: n }; UI.planPresupuesto = null; guardar(); render(); break; }
    case "reserva-mas": cambiarReserva(1); break;
    case "reserva-menos": cambiarReserva(-1); break;
    case "reserva-fija": cambiarReserva(0, Number(k)); break;
    case "pref": { const [g, v] = k.split(":"); const pl = S.ajustes.plan; if (g === "prioridad" || g === "mesesVerano") { const n = g === "mesesVerano" ? Number(v) : v; pl[g] = pl[g].includes(n) ? pl[g].filter((x) => x !== n) : [...pl[g], n]; } else pl[g] = v; guardar(); UI.planRes = null; render(); break; }
    case "guardar-mas": cambiarGuardar(1); break;
    case "guardar-menos": cambiarGuardar(-1); break;
    case "dia":
      if (UI.rangoModo) {
        if (!UI.ancla) { UI.ancla = d; toast("Ahora toca el último día del rango"); render(); break; }
        const [x, y] = [UI.ancla, d].sort(); rango(x, y).forEach((i) => poner(i, UI.herramienta)); UI.ancla = null;
      } else alternar(d);
      guardar(); render(); break;
    case "herr": UI.herramienta = k; UI.ancla = null; render(); break;
    case "rango": UI.rangoModo = !UI.rangoModo; UI.ancla = null; render(); break;
    case "calor": UI.calor = !UI.calor; render(); break;
    case "toggle-puente": {
      const desde = b.dataset.src === "inicio" ? (anio === anioActual ? hoy : null) : (UI.soloFuturos && anio === anioActual ? hoy : null);
      const lista = b.dataset.src === "inicio" ? M.puentes(C, anio, { maxCoste: 3, desde, limite: 3 }) : UI.lastPuentes, p = lista[Number(k)];
      if (!p) break; const estaba = estaAplicado(p); estaba ? desmarcarBloque(p) : marcarBloque(p); guardar(); render(); toast(estaba ? "Quitado" : "Añadido a tu calendario"); break;
    }
    case "quitar-dia": delete S.marcas[d]; guardar(); render(); break;
    case "solicitud": { const t = textoSolicitud(); if (!t) return toast("Aún no has marcado vacaciones"); toast((await copiar(t)) ? "Solicitud copiada" : "No se pudo copiar"); break; }
    case "ics-mio": { const bl = M.bloquesActuales(C, anio); if (!bl.length) return toast("Aún no has marcado vacaciones"); descargar(`vacaciones-${anio}.ics`, generarICS(eventosVacaciones(bl), { nombre: `Mis vacaciones ${anio}`, ahoraISO: new Date().toISOString() }), "text/calendar"); break; }
    case "ics-festivos": descargar(`festivos-lpgc-${anio}.ics`, generarICS(eventosFestivos([{ lista: F.anio(anio).lista }]), { nombre: `Festivos Las Palmas de Gran Canaria ${anio}`, ahoraISO: new Date().toISOString() }), "text/calendar"); break;
    case "imprimir": UI.calSub = "anio"; render(); setTimeout(() => window.print(), 100); break;
    case "borrar-vac": if (confirm(`¿Quitar todas tus vacaciones de ${anio}?`)) { for (const x of Object.keys(S.marcas)) if (S.marcas[x] === "V" && anioDe(x) === anio) delete S.marcas[x]; guardar(); render(); } break;
    case "calcular-plan": calcularPlanes(); render(); break;
    case "aplicar-plan": { const r = UI.planRes?.[k]; if (!r) break; r.bloques.forEach(marcarBloque); guardar(); UI.planRes = null; UI.calSub = innerWidth < 820 ? "anio" : UI.calSub; toast("Plan aplicado a tu calendario"); ir("calendario"); break; }
    case "sem": { const w = Number(k), s = S.ajustes.semana; S.ajustes.semana = s.includes(w) ? s.filter((x) => x !== w) : [...s, w]; guardar(); render(); break; }
    case "add-empresa": { const f = $("#empFecha").value, n = $("#empNombre").value.trim() || "Día de empresa"; if (!f) return toast("Elige una fecha"); S.ajustes.empresaDias.push({ fecha: f, nombre: n }); S.ajustes.empresaDias.sort((x, y) => x.fecha.localeCompare(y.fecha)); guardar(); F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias); render(); break; }
    case "del-empresa": S.ajustes.empresaDias.splice(Number(k), 1); guardar(); F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias); render(); break;
    case "exportar": descargar("vacaciones-gc.json", JSON.stringify(datosExport(), null, 1), "application/json"); break;
    case "quitar-pareja": S.pareja = []; guardar(); render(); break;
    case "sync-subir": sync("subir"); break;
    case "sync-bajar": sync("bajar"); break;
    case "recargar": await cargarDatos(); render(); toast("Datos actualizados"); try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch {} break;
    case "reset": if (confirm("¿Borrar TODOS tus datos de este dispositivo?")) { S = structuredClone(POR_DEFECTO); guardar(); aplicarTema(); F = creaFestivos(DATOS, MANUAL, []); render(); } break;
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.set) {
    const k = t.dataset.set;
    if (k === "extraAnio" || k === "entrantes" || k === "gastados") S.ajustes[k] = { ...S.ajustes[k], [anio]: t.value === "" ? undefined : Number(t.value) || 0 };
    else if (["diasAnuales", "arrastreMax"].includes(k)) S.ajustes[k] = Number(t.value) || 0;
    else if (k === "arrastreCaduca") S.ajustes[k] = t.checked;
    else if (k === "arrastreLimite") S.ajustes[k] = t.value.slice(5) || "03-31";
    else S.ajustes[k] = t.value;
    guardar(); if (k === "tema") aplicarTema(); return render();
  }
  if (t.dataset.ui) { const k = t.dataset.ui; UI[k] = t.type === "checkbox" ? t.checked : Number(t.value); if (k !== "planPresupuesto") render(); return; }
  if (t.dataset.file) {
    const f = t.files?.[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (t.dataset.file === "pareja") { S.pareja = Object.keys(d.marcas || {}).filter((x) => d.marcas[x] === "V"); toast(`Importados ${S.pareja.length} días de tu pareja`); }
      else { S.marcas = d.marcas || {}; S.pareja = d.pareja || []; S.ajustes = { ...POR_DEFECTO.ajustes, ...S.ajustes, ...d.ajustes, token: S.ajustes.token, repo: S.ajustes.repo }; toast("Datos importados"); }
      guardar(); aplicarTema(); F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias); render();
    } catch { toast("Archivo no válido"); }
  }
});

/* ---------- Arranque ---------- */
(async function init() {
  aplicarTema();
  await cargarDatos();
  const v = location.hash.slice(2); vista = FN[v] ? v : "inicio";
  render({ conservarScroll: false });
  addEventListener("hashchange", () => { const x = location.hash.slice(2); if (FN[x] && x !== vista) { vista = x; render({ conservarScroll: false }); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
