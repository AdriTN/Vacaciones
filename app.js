// Vacaciones GC — interfaz. Toda la lógica de cálculo vive en lib/ (probada con node --test).
import { hoyISO, sumarDias, dow, rango, anioDe, mesDe, MESES, DIAS, fechaLarga, fechaCorta, rangoTexto, plural, diasEntre, iso } from "./lib/util.mjs";
import { creaFestivos, festivosDelAnio, TIPOS } from "./lib/festivos.mjs";
import * as M from "./lib/motor.mjs";
import { generarICS, eventosVacaciones, eventosFestivos } from "./lib/ics.mjs";

const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "vacgc-v1";
const POR_DEFECTO = { ajustes: { diasAnuales: 22, extraAnio: {}, semana: [1, 2, 3, 4, 5], limiteExtra: 0, jefe: "", empresaDias: [], tema: "auto", repo: "", token: "" }, marcas: {}, pareja: [] };

function cargar() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r) return { ...POR_DEFECTO, ...r, ajustes: { ...POR_DEFECTO.ajustes, ...r.ajustes } }; } catch {}
  return structuredClone(POR_DEFECTO);
}
let S = cargar();
const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const hoy = hoyISO();
const anioActual = anioDe(hoy);
let anio = anioActual, vista = "inicio";
let DATOS = { anios: {} }, MANUAL = {}, CAMBIOS = { cambios: [] }, SALUD = null, F = null, C = null;
const UI = { herramienta: "V", rangoModo: false, ancla: null, calor: false, puentesMax: 4, soloFuturos: true, planRes: null, planPresupuesto: null, planMeses: [6, 7, 8, 9], planDesdeHoy: true };

const ICO = {
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  puentes: '<path d="M3 17h18M5 17v-5a7 7 0 0 1 14 0v5M12 5v12"/>',
  plan: '<path d="M5 19L19 5M14 5h5v5M5 5l2 2M5 12l2 0M12 19l0-2"/>',
  festivos: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
};
const VISTAS = [["inicio", "Inicio"], ["calendario", "Calendario"], ["puentes", "Puentes"], ["plan", "Plan"], ["festivos", "Festivos"], ["ajustes", "Ajustes"]];
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

async function json(u, def) { try { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw 0; return await r.json(); } catch { return def; } }
function reconstruir() {
  F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias);
  C = { festivos: F, semana: new Set(S.ajustes.semana), vac: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "V")), bloqueados: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "B")) };
}
const cfgAnio = (a) => ({ diasAnuales: S.ajustes.diasAnuales, arrastrados: 0, extra: Number(S.ajustes.extraAnio?.[a] || 0) });
const limiteAnio = (a) => sumarDias(`${a}-12-31`, Number(S.ajustes.limiteExtra || 0));
const toast = (t) => { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 2600); };
const en = (n, u, p) => plural(n, u, p);
const cuenta = (i) => { const n = diasEntre(hoy, i); return n === 0 ? "hoy" : n === 1 ? "mañana" : n > 0 ? `en ${n} días` : `hace ${-n} días`; };
const pillTipo = (t) => `<span class="pill ${TIPOS[t]?.clase || ""}">${h(TIPOS[t]?.etiqueta || t)}</span>`;

/* ---------- Tarjetas reutilizables ---------- */
function bloqueHTML(b, { botones = "" } = {}) {
  const r = (b.libres / b.coste).toFixed(1).replace(".", ",");
  return `<div class="puente"><div class="fila sp"><strong>${h(rangoTexto(b.ini, b.fin))}</strong><span class="pill ok">×${r}</span></div>
    <div class="peq">Pides <b>${en(b.coste, "día", "días")}</b> y descansas <b>${en(b.libres, "día", "días")} seguidos</b>${b.festivos.length ? ` · ${h([...new Set(b.festivos)].join(", "))}` : ""}</div>
    <div class="dias">${b.pedir.map((d) => `<span>${h(fechaCorta(d))}</span>`).join("")}</div>${botones ? `<div class="fila">${botones}</div>` : ""}</div>`;
}
const estaAplicado = (b) => b.pedir.every((d) => S.marcas[d] === "V");

/* ---------- Vistas ---------- */
function avisosAnio(a) {
  const y = F.anio(a), out = [];
  if (y.estado !== "oficial") out.push(`<div class="card aviso"><h3>Calendario de ${a}: ${y.estado === "parcial" ? "parcial" : "estimado"}</h3><p class="peq mut">${h(y.fuente)}</p>${y.notas.map((n) => `<p class="peq">${h(n)}</p>`).join("")}<p class="peq mut">Se actualiza solo cada día; si se publica algo distinto, te lo aviso aquí.</p></div>`);
  else for (const n of y.notas) out.push(`<div class="card aviso"><p class="peq">⚠ ${h(n)}</p></div>`);
  return out.join("");
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

function vInicio() {
  const sd = M.saldo(C, cfgAnio(anio), anio), pct = Math.max(0, Math.min(100, (sd.usados / (sd.total || 1)) * 100));
  const desde = anio === anioActual ? hoy : null, limite = limiteAnio(anio);
  let urgencia = "";
  if (anio === anioActual && sd.restantes > 0) {
    const quedan = rango(hoy, limite).filter((d) => M.esLaborable(C, d) && !C.vac.has(d) && !C.bloqueados.has(d)).length;
    urgencia = quedan <= sd.restantes * 2.5 ? `<p class="peq" style="color:var(--warn)">⚠ Te quedan ${en(sd.restantes, "día", "días")} y solo ${en(quedan, "día laborable", "días laborables")} hasta el ${h(fechaLarga(limite))}. Conviene planificarlos ya.</p>` : `<p class="peq mut">Hasta el ${h(fechaLarga(limite))} quedan ${en(quedan, "día laborable", "días laborables")}.</p>`;
  }
  const pts = M.puentes(C, anio, { maxCoste: 3, desde, limite: 3 });
  const proxF = M.proximos(F, desde || iso(anio, 1, 1), 4);
  const futuros = M.bloquesActuales(C, anio).filter((b) => b.fin >= hoy);
  const sig = futuros[0];
  return `<h2>Tus vacaciones ${anio}</h2><p class="sub">Calendario de Las Palmas de Gran Canaria, con puentes y plan automático.</p>
  <div class="grid">
  <div class="card"><h3>Saldo</h3><div class="fila sp"><div><span class="gran num">${sd.restantes}</span> <span class="mut">de ${sd.total} días restantes</span></div></div>
    <div class="barra" style="margin:10px 0"><i style="width:${pct}%"></i></div><p class="peq mut">${en(sd.usados, "día pedido", "días pedidos")}${sd.restantes < 0 ? " · <b style='color:var(--err)'>te pasas del saldo</b>" : ""}</p>${urgencia}
    <div class="fila"><button class="btn pri chico" data-go="plan">Generar plan</button><button class="btn chico" data-go="calendario">Ver calendario</button></div></div>
  <div class="card"><h3>${sig ? "Próximas vacaciones" : "Aún sin vacaciones elegidas"}</h3>${sig ? `${bloqueHTML(sig)}<p class="peq mut">${cuenta(sig.ini)}</p>` : `<p class="peq mut">Marca días en el calendario o aplica uno de los planes sugeridos.</p>`}</div>
  <div class="card"><h3>Mejores puentes ${desde ? "que vienen" : "del año"}</h3>${pts.length ? pts.map((b, i) => bloqueHTML(b, { botones: `<button class="btn chico ${estaAplicado(b) ? "" : "pri"}" data-act="toggle-puente" data-k="${i}" data-src="inicio">${estaAplicado(b) ? "Quitar" : "Añadir"}</button>` })).join("<hr>") : `<p class="peq mut">No quedan puentes rentables con ≤3 días.</p>`}</div>
  <div class="card"><h3>Próximos festivos</h3><ul class="lista">${proxF.map((f) => `<li><span>${h(fechaLarga(f.fecha))}<br><span class="peq mut">${h(f.nombre)}</span></span><span class="peq mut">${cuenta(f.fecha)}</span></li>`).join("") || "<li class='mut'>Sin festivos próximos</li>"}</ul></div>
  ${avisosConflicto()}${avisosAnio(anio)}${cambiosRecientes()}
  </div>`;
}

function mesHTML(a, m) {
  const primero = iso(a, m, 1), n = new Date(Date.UTC(a, m, 0)).getUTCDate(), off = (dow(primero) + 6) % 7;
  const celdas = [...Array(off).fill('<span class="d vacio"></span>')];
  const parejaSet = new Set(S.pareja);
  for (let d = 1; d <= n; d++) {
    const i = iso(a, m, d), f = F.get(i), w = dow(i), cl = ["d"];
    if (!S.ajustes.semana.includes(w)) cl.push("fin");
    if (f) cl.push("f", TIPOS[f.tipo]?.clase || "");
    const mk = S.marcas[i]; if (mk) cl.push(mk);
    if (parejaSet.has(i)) cl.push("P");
    if (i === hoy) cl.push("hoy"); else if (i < hoy) cl.push("pasado");
    if (UI.calor && i >= hoy && !f && !mk && M.esLaborable(C, i)) { const v = M.valorDia(C, i); if (v >= 4) cl.push(`h${Math.min(5, v - 1)}`); }
    const tip = `${fechaLarga(i)}${f ? " · " + f.nombre : ""}${mk === "V" ? " · vacaciones" : mk === "B" ? " · no disponible" : ""}${parejaSet.has(i) ? " · pareja" : ""}`;
    celdas.push(`<button class="${cl.join(" ")}" data-act="dia" data-d="${i}" title="${h(tip)}" aria-label="${h(tip)}">${d}</button>`);
  }
  return `<div class="mes"><h4>${MESES[m - 1]}</h4><div class="sem"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="cuad">${celdas.join("")}</div></div>`;
}
function vCalendario() {
  const bl = M.bloquesActuales(C, anio), sd = M.saldo(C, cfgAnio(anio), anio);
  const herr = [["V", "Vacaciones"], ["B", "No disponible"], ["P", "Pareja"], ["X", "Borrar"]];
  const comun = S.pareja.filter((d) => anioDe(d) === anio && (C.vac.has(d) || !M.esLaborable(C, d))).length;
  return `<h2>Calendario ${anio}</h2><p class="sub">Toca un día para marcarlo. Los festivos y fines de semana ya son libres: no gastan vacaciones.</p>
  <div class="fila sp"><div class="herr">${herr.map(([k, t]) => `<button class="chip ${UI.herramienta === k ? "on" : ""}" data-act="herr" data-k="${k}">${t}</button>`).join("")}
    <button class="chip ${UI.rangoModo ? "on" : ""}" data-act="rango">${UI.rangoModo ? (UI.ancla ? "Rango: toca el último día" : "Rango: toca el primer día") : "Rango"}</button>
    <button class="chip ${UI.calor ? "on" : ""}" data-act="calor" title="Colorea cada día según los días seguidos libres que lograrías pidiéndolo">Mapa de calor</button></div>
    <div class="peq"><b>${sd.restantes}</b> de ${sd.total} días restantes</div></div>
  <div class="leyenda"><span><i style="background:var(--nac)"></i>Nacional</span><span><i style="background:var(--can)"></i>Canarias</span><span><i style="background:var(--isl)"></i>Gran Canaria</span><span><i style="background:var(--loc)"></i>Las Palmas G.C.</span><span><i style="background:var(--emp)"></i>Empresa</span><span><i style="background:var(--vac)"></i>Tus vacaciones</span><span><i style="background:repeating-linear-gradient(45deg,var(--blq),var(--blq) 3px,transparent 3px,transparent 6px)"></i>No disponible</span><span><i style="border:2px solid var(--par)"></i>Pareja</span></div>
  <div class="meses">${Array.from({ length: 12 }, (_, k) => mesHTML(anio, k + 1)).join("")}</div>
  <div class="grid" style="margin-top:16px">
  <div class="card ancho"><div class="fila sp"><h3>Mis bloques de vacaciones</h3><div class="fila noprint"><button class="btn chico" data-act="solicitud">Copiar solicitud</button><button class="btn chico" data-act="ics-mio">Exportar .ics</button><button class="btn chico" data-act="imprimir">Imprimir</button><button class="btn chico peligro" data-act="borrar-vac">Borrar vacaciones ${anio}</button></div></div>
    ${bl.length ? `<div class="grid">${bl.map((b) => `<div>${bloqueHTML(b)}</div>`).join("")}</div>` : `<p class="peq mut">Todavía no has marcado ningún día.</p>`}
    ${S.pareja.length ? `<p class="peq">💞 Días libres en común con tu pareja: <b>${comun}</b> de ${S.pareja.filter((d) => anioDe(d) === anio).length}.</p>` : ""}</div>
  ${avisosConflicto()}</div>`;
}

function vPuentes() {
  const desde = UI.soloFuturos && anio === anioActual ? hoy : null;
  const lista = M.puentes(C, anio, { maxCoste: UI.puentesMax, desde, limite: 40 });
  UI.lastPuentes = lista;
  return `<h2>Mejores puentes ${anio}</h2><p class="sub">Combinaciones de pocos días de vacaciones con festivos y fines de semana, ordenadas por rendimiento (días libres seguidos por cada día pedido).</p>
  <div class="card"><div class="form"><label class="campo">Máximo de días a pedir: <b>${UI.puentesMax}</b><input type="range" min="1" max="8" value="${UI.puentesMax}" data-ui="puentesMax"></label>
  ${anio === anioActual ? `<label class="campo"><span>Solo los que aún no han pasado</span><input type="checkbox" ${UI.soloFuturos ? "checked" : ""} data-ui="soloFuturos" style="width:22px;height:22px"></label>` : ""}</div></div>
  <div class="grid" style="margin-top:14px">${lista.map((b, i) => `<div class="card">${bloqueHTML(b, { botones: `<button class="btn chico ${estaAplicado(b) ? "" : "pri"}" data-act="toggle-puente" data-k="${i}" data-src="puentes">${estaAplicado(b) ? "Quitar de mi plan" : "Añadir a mi plan"}</button>` })}</div>`).join("") || `<div class="card"><p class="mut">No hay puentes que cumplan el filtro.</p></div>`}</div>`;
}

function planCard(clave, r) {
  const p = M.PRESETS[clave], rend = r.coste ? (r.libres / r.coste).toFixed(2).replace(".", ",") : "–";
  return `<div class="card plan"><div class="fila sp"><h3>${h(p.nombre)}</h3><span class="pill ok">×${rend}</span></div><p class="peq mut">${h(p.desc)}</p>
    <p class="peq"><b>${en(r.coste, "día", "días")}</b> pedidos · <b>${r.libres}</b> días libres en ${en(r.bloques.length, "bloque", "bloques")}${r.sinAsignar > 0 ? ` · <span style="color:var(--warn)">${r.sinAsignar} sin asignar</span>` : ""}</p>
    <ul class="lista peq">${r.bloques.map((b) => `<li><span>${h(rangoTexto(b.ini, b.fin))}</span><span class="mut">${b.coste}→${b.libres}</span></li>`).join("")}</ul>
    <div class="fila" style="margin-top:10px"><button class="btn pri chico" data-act="aplicar-plan" data-k="${clave}">Aplicar a mi calendario</button></div></div>`;
}
function vPlan() {
  const sd = M.saldo(C, cfgAnio(anio), anio), pres = UI.planPresupuesto ?? Math.max(0, sd.restantes);
  return `<h2>Plan automático ${anio}</h2><p class="sub">Reparte tus días entre bloques que no se solapan y compara estrategias. Respeta lo que ya has marcado y tus días no disponibles.</p>
  <div class="card"><div class="form"><label class="campo">Días a repartir<input type="number" min="1" max="60" value="${pres}" data-ui="planPresupuesto"></label>
    ${anio === anioActual ? `<label class="campo"><span>Solo desde hoy</span><input type="checkbox" ${UI.planDesdeHoy ? "checked" : ""} data-ui="planDesdeHoy" style="width:22px;height:22px"></label>` : ""}</div>
    <p class="peq" style="margin:12px 0 6px"><b>Meses para el bloque largo</b> (estrategia «Verano largo»)</p><div class="fila">${MESES.map((m, k) => `<button class="chip ${UI.planMeses.includes(k + 1) ? "on" : ""}" data-act="mes-plan" data-k="${k + 1}">${m.slice(0, 3)}</button>`).join("")}</div>
    <div class="fila" style="margin-top:12px"><button class="btn pri" data-act="calcular-plan">Calcular planes</button></div></div>
  <div class="grid" style="margin-top:14px">${UI.planRes ? Object.entries(UI.planRes).map(([k, r]) => planCard(k, r)).join("") : `<div class="card"><p class="mut">Pulsa «Calcular planes» para ver las cuatro estrategias.</p></div>`}</div>
  ${UI.planRes ? `<p class="peq mut">×N = días libres seguidos por cada día de vacaciones. El plan nunca gasta más de lo indicado.</p>` : ""}`;
}

function vFestivos() {
  const y = F.anio(anio), lista = y.lista;
  const res = M.resumenAnio(C, anio, lista), est = { oficial: ["ok", "Oficial"], parcial: ["warn", "Parcial"], estimado: ["warn", "Estimado"] }[y.estado] || ["warn", y.estado];
  return `<h2>Festivos ${anio} · Las Palmas de Gran Canaria</h2><p class="sub">Nacionales, de Canarias, insular (Virgen del Pino) y locales. <span class="pill ${est[0]}">${est[1]}</span></p>
  <div class="grid"><div class="card ancho"><p class="peq mut">${h(y.fuente)}</p>${y.notas.map((n) => `<p class="peq">⚠ ${h(n)}</p>`).join("")}
  <p class="peq">${en(lista.length, "festivo", "festivos")}: <b>${res.enSemana}</b> caen en día laborable y <b>${res.perdidos.length}</b> en fin de semana${res.perdidos.length ? ` (${res.perdidos.map((f) => h(fechaCorta(f.fecha))).join(", ")})` : ""}.</p>
  <div class="fila noprint"><a class="btn chico" href="data/calendario.ics">Suscribirse (.ics)</a><button class="btn chico" data-act="ics-festivos">Descargar festivos ${anio}</button></div></div>
  <div class="card ancho"><table class="t"><tbody>${lista.map((f) => `<tr class="${f.fecha < hoy ? "pasado" : ""}"><td class="num">${h(fechaLarga(f.fecha))}</td><td>${h(f.nombre)}${f.nota ? `<br><span class="peq mut">${h(f.nota)}</span>` : ""}${f.pendienteBOC ? `<br><span class="peq" style="color:var(--warn)">Pendiente de publicar en el BOC</span>` : ""}</td><td>${pillTipo(f.tipo)}</td><td class="peq mut">${S.ajustes.semana.includes(dow(f.fecha)) ? cuenta(f.fecha) : "fin de semana"}</td></tr>`).join("")}</tbody></table></div>
  ${cambiosRecientes()}${SALUD?.lecturas?.length ? `<div class="card ancho"><details><summary>Estado de las lecturas oficiales</summary><ul class="lista peq" style="margin-top:8px">${SALUD.lecturas.map((l) => `<li><span>${l.ok ? "✔" : "✖"} ${h(l.nombre)}</span><span class="mut">${h(l.detalle || "")}</span></li>`).join("")}</ul><p class="peq mut">Última lectura: ${h(SALUD.generado || "nunca")}</p></details></div>` : ""}</div>`;
}

function vAjustes() {
  const a = S.ajustes, extra = Number(a.extraAnio?.[anio] || 0), dsem = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
  return `<h2>Ajustes</h2><p class="sub">Todo se guarda en este dispositivo. Puedes sincronizarlo con tu repositorio o exportarlo.</p>
  <div class="grid">
  <div class="card"><h3>Tus días</h3><div class="form"><label class="campo">Días de vacaciones al año<input type="number" min="0" max="60" value="${a.diasAnuales}" data-set="diasAnuales"></label>
    <label class="campo">Extra o arrastrados en ${anio}<input type="number" min="-30" max="60" value="${extra}" data-set="extraAnio"></label>
    <label class="campo">Margen tras el 31 dic (días)<input type="number" min="0" max="90" value="${a.limiteExtra}" data-set="limiteExtra"></label></div>
    <p class="peq mut">Extra: asuntos propios, días por festivo en fin de semana, etc. El margen sirve si tu convenio deja disfrutarlas hasta enero.</p>
    <p class="peq" style="margin:12px 0 6px"><b>Días que trabajas</b></p><div class="fila">${dsem.map(([k, t]) => `<button class="chip ${a.semana.includes(k) ? "on" : ""}" data-act="sem" data-k="${k}">${t}</button>`).join("")}</div></div>
  <div class="card"><h3>Solicitud de vacaciones</h3><label class="campo">Nombre de a quién se la envías<input type="text" value="${h(a.jefe)}" data-set="jefe" placeholder="p. ej. tu responsable"></label><p class="peq mut">Se usa en el texto que genera «Copiar solicitud».</p>
    <h3 style="margin-top:14px">Apariencia</h3><label class="campo"><select data-set="tema"><option value="auto" ${a.tema === "auto" ? "selected" : ""}>Automática</option><option value="claro" ${a.tema === "claro" ? "selected" : ""}>Clara</option><option value="oscuro" ${a.tema === "oscuro" ? "selected" : ""}>Oscura</option></select></label></div>
  <div class="card"><h3>Días de empresa</h3><p class="peq mut">Cierres o festivos propios de tu empresa (24 y 31 dic, patrón…). No gastan vacaciones.</p>
    <ul class="lista peq">${a.empresaDias.map((d, k) => `<li><span>${h(fechaLarga(d.fecha))} · ${h(d.nombre)}</span><button class="btn chico peligro" data-act="del-empresa" data-k="${k}">Quitar</button></li>`).join("")}</ul>
    <div class="fila" style="margin-top:8px"><input type="date" id="empFecha" style="flex:1"><input type="text" id="empNombre" placeholder="Nombre" style="flex:1"><button class="btn chico" data-act="add-empresa">Añadir</button></div></div>
  <div class="card"><h3>Copia y pareja</h3><div class="fila"><button class="btn chico" data-act="exportar">Exportar mis datos</button><label class="btn chico">Importar<input type="file" accept="application/json" data-file="importar" hidden></label></div>
    <p class="peq mut" style="margin-top:10px">Pareja: importa el archivo exportado de otra persona para ver sus vacaciones en tu calendario y los días libres en común.</p>
    <div class="fila"><label class="btn chico">Importar vacaciones de tu pareja<input type="file" accept="application/json" data-file="pareja" hidden></label>${S.pareja.length ? `<button class="btn chico peligro" data-act="quitar-pareja">Quitar</button>` : ""}</div></div>
  <div class="card"><h3>Sincronizar con GitHub (opcional)</h3><p class="peq mut">Guarda tus marcas en <code>data/mis-vacaciones.json</code> de tu repositorio para usarlas en el móvil y el PC. Con repositorio público, cualquiera podría leerlas.</p>
    <div class="form"><label class="campo">Repositorio<input type="text" value="${h(a.repo)}" data-set="repo" placeholder="usuario/Vacaciones-GC"></label><label class="campo">Token (Contents: read & write)<input type="password" value="${h(a.token)}" data-set="token" autocomplete="off"></label></div>
    <div class="fila" style="margin-top:10px"><button class="btn chico" data-act="sync-subir">Subir</button><button class="btn chico" data-act="sync-bajar">Bajar</button></div></div>
  <div class="card"><h3>Datos</h3><p class="peq mut">Festivos cargados: ${Object.keys(DATOS.anios || {}).join(", ") || "reglas internas"}. Versión de datos: ${h(DATOS.generado || "—")}.</p><div class="fila"><button class="btn chico" data-act="recargar">Buscar actualización</button><button class="btn chico peligro" data-act="reset">Borrar todo</button></div></div>
  </div>`;
}

/* ---------- Render y navegación ---------- */
const FN = { inicio: vInicio, calendario: vCalendario, puentes: vPuentes, plan: vPlan, festivos: vFestivos, ajustes: vAjustes };
function aplicarTema() { const t = S.ajustes.tema; if (t === "auto") delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t; }
function reconstruirCtx() { C = { festivos: F, semana: new Set(S.ajustes.semana), vac: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "V")), bloqueados: new Set(Object.keys(S.marcas).filter((k) => S.marcas[k] === "B")) }; }
function navHTML() { return VISTAS.map(([k, t]) => `<button class="nav ${vista === k ? "on" : ""}" data-go="${k}" ${vista === k ? 'aria-current="page"' : ""}>${svg(k)}<span>${t}</span></button>`).join(""); }
function render({ conservarScroll = true } = {}) {
  const y = window.scrollY; reconstruirCtx();
  $("#side").innerHTML = `<div class="marca"><img src="icon-192.png" alt="">Vacaciones GC</div>${navHTML()}`;
  $("#tabs").innerHTML = navHTML();
  $("#titulo").textContent = VISTAS.find((v) => v[0] === vista)[1];
  $("#selAnio").innerHTML = [0, 1, 2].map((k) => `<option value="${anioActual + k}" ${anio === anioActual + k ? "selected" : ""}>${anioActual + k}</option>`).join("");
  $("#sync").textContent = DATOS.generado ? `Datos: ${DATOS.generado.slice(0, 10)}` : "";
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
const datosExport = () => ({ version: 1, exportado: new Date().toISOString(), marcas: S.marcas, pareja: S.pareja, ajustes: { ...S.ajustes, token: "", repo: "" } });
const b64 = (s) => btoa(unescape(encodeURIComponent(s))), deb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
async function ghArchivo() {
  const { repo, token } = S.ajustes; if (!repo || !token) { toast("Rellena repositorio y token en Ajustes"); return null; }
  return { url: `https://api.github.com/repos/${repo}/contents/data/mis-vacaciones.json`, cab: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } };
}
async function sync(dir) {
  const g = await ghArchivo(); if (!g) return;
  try {
    const r = await fetch(g.url, { headers: g.cab }); const existe = r.ok ? await r.json() : null;
    if (dir === "bajar") {
      if (!existe) return toast("No hay datos subidos todavía");
      const d = JSON.parse(deb64(existe.content)); S.marcas = d.marcas || {}; S.pareja = d.pareja || []; S.ajustes = { ...S.ajustes, ...d.ajustes, token: S.ajustes.token, repo: S.ajustes.repo };
      guardar(); aplicarTema(); render(); return toast("Datos descargados");
    }
    const p = await fetch(g.url, { method: "PUT", headers: g.cab, body: JSON.stringify({ message: "Vacaciones: actualizar plan", content: b64(JSON.stringify(datosExport(), null, 1)), ...(existe ? { sha: existe.sha } : {}) }) });
    toast(p.ok ? "Datos subidos" : `No se pudo subir (${p.status})`);
  } catch (e) { toast("Sin conexión con GitHub"); }
}
async function cargarDatos() {
  [DATOS, MANUAL, CAMBIOS, SALUD] = await Promise.all([json("data/festivos.json", { anios: {} }), json("data/manual.json", {}), json("data/cambios.json", { cambios: [] }), json("data/salud.json", null)]);
  F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias);
}

document.addEventListener("click", async (e) => {
  const go = e.target.closest("[data-go]"); if (go) return ir(go.dataset.go);
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, k = b.dataset.k, d = b.dataset.d;
  switch (a) {
    case "dia":
      if (UI.rangoModo) {
        if (!UI.ancla) { UI.ancla = d; toast("Ahora toca el último día del rango"); break; }
        const [x, y] = [UI.ancla, d].sort(); const t = UI.herramienta;
        rango(x, y).forEach((i) => poner(i, t === "V" || t === "B" || t === "P" || t === "X" ? t : "V"));
        UI.ancla = null;
      } else alternar(d);
      guardar(); render(); break;
    case "herr": UI.herramienta = k; UI.ancla = null; render(); break;
    case "rango": UI.rangoModo = !UI.rangoModo; UI.ancla = null; render(); break;
    case "calor": UI.calor = !UI.calor; render(); break;
    case "toggle-puente": {
      const desde = b.dataset.src === "inicio" ? (anio === anioActual ? hoy : null) : (UI.soloFuturos && anio === anioActual ? hoy : null);
      const lista = b.dataset.src === "inicio" ? M.puentes(C, anio, { maxCoste: 3, desde, limite: 3 }) : UI.lastPuentes, p = lista[Number(k)];
      if (!p) break; estaAplicado(p) ? desmarcarBloque(p) : marcarBloque(p); guardar(); render();
      toast(estaAplicado(p) ? "Añadido a tu calendario" : "Quitado"); break;
    }
    case "quitar-dia": delete S.marcas[d]; guardar(); render(); break;
    case "solicitud": { const t = textoSolicitud(); if (!t) return toast("Aún no has marcado vacaciones"); toast((await copiar(t)) ? "Solicitud copiada" : "No se pudo copiar"); break; }
    case "ics-mio": { const bl = M.bloquesActuales(C, anio); if (!bl.length) return toast("Aún no has marcado vacaciones"); descargar(`vacaciones-${anio}.ics`, generarICS(eventosVacaciones(bl), { nombre: `Mis vacaciones ${anio}`, ahoraISO: new Date().toISOString() }), "text/calendar"); break; }
    case "ics-festivos": descargar(`festivos-lpgc-${anio}.ics`, generarICS(eventosFestivos([{ lista: F.anio(anio).lista }]), { nombre: `Festivos Las Palmas de Gran Canaria ${anio}`, ahoraISO: new Date().toISOString() }), "text/calendar"); break;
    case "imprimir": window.print(); break;
    case "borrar-vac": if (confirm(`¿Quitar todas tus vacaciones de ${anio}?`)) { for (const x of Object.keys(S.marcas)) if (S.marcas[x] === "V" && anioDe(x) === anio) delete S.marcas[x]; guardar(); render(); } break;
    case "mes-plan": { const m = Number(k); UI.planMeses = UI.planMeses.includes(m) ? UI.planMeses.filter((x) => x !== m) : [...UI.planMeses, m]; render(); break; }
    case "calcular-plan": {
      const sd = M.saldo(C, cfgAnio(anio), anio), presupuesto = UI.planPresupuesto ?? Math.max(0, sd.restantes);
      const desde = UI.planDesdeHoy && anio === anioActual ? hoy : null; UI.planRes = {};
      for (const [clave, p] of Object.entries(M.PRESETS)) {
        const ancla = p.ancla ? { ...p.ancla, meses: UI.planMeses.length ? UI.planMeses : p.ancla.meses } : null;
        UI.planRes[clave] = M.planOptimo(C, anio, { ...p, ancla, presupuesto, desde });
      }
      render(); break;
    }
    case "aplicar-plan": { const r = UI.planRes?.[k]; if (!r) break; r.bloques.forEach(marcarBloque); guardar(); UI.planRes = null; toast("Plan aplicado a tu calendario"); ir("calendario"); break; }
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
  if (t.id === "selAnio") { anio = Number(t.value); UI.planRes = null; return render(); }
  if (t.dataset.set) {
    const k = t.dataset.set;
    if (k === "extraAnio") S.ajustes.extraAnio = { ...S.ajustes.extraAnio, [anio]: Number(t.value) || 0 };
    else if (["diasAnuales", "limiteExtra"].includes(k)) S.ajustes[k] = Number(t.value) || 0;
    else S.ajustes[k] = t.value;
    guardar(); if (k === "tema") aplicarTema(); return render();
  }
  if (t.dataset.ui) { const k = t.dataset.ui; UI[k] = t.type === "checkbox" ? t.checked : Number(t.value); if (k !== "planPresupuesto") render(); return; }
  if (t.dataset.file) {
    const f = t.files?.[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (t.dataset.file === "pareja") { S.pareja = Object.keys(d.marcas || {}).filter((x) => d.marcas[x] === "V"); toast(`Importados ${S.pareja.length} días de tu pareja`); }
      else { S.marcas = d.marcas || {}; S.pareja = d.pareja || []; S.ajustes = { ...S.ajustes, ...d.ajustes, token: S.ajustes.token, repo: S.ajustes.repo }; toast("Datos importados"); }
      guardar(); aplicarTema(); F = creaFestivos(DATOS, MANUAL, S.ajustes.empresaDias); render();
    } catch { toast("Archivo no válido"); }
  }
});

/* ---------- Arranque ---------- */
(async function init() {
  aplicarTema();
  await cargarDatos();
  vista = VISTAS.some((v) => `#/${v[0]}` === location.hash) ? location.hash.slice(2) : "inicio";
  render({ conservarScroll: false });
  addEventListener("hashchange", () => { const v = location.hash.slice(2); if (VISTAS.some((x) => x[0] === v) && v !== vista) { vista = v; render({ conservarScroll: false }); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
