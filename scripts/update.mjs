// Actualizador diario (GitHub Actions). Lee el BOC, valida lo que encuentra y regenera:
//   data/festivos.json   festivos por año con su estado (oficial / parcial / estimado)
//   data/cambios.json    historial de cambios detectados (la app los muestra y avisa si afectan a tus vacaciones)
//   data/calendario.ics  calendario de festivos suscribible
//   data/salud.json      qué lecturas funcionaron
//   data/nuevos.md       (solo si hay algo que avisar) texto para abrir un Issue en GitHub → notificación al móvil
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { reglas, festivosDelAnio } from "../lib/festivos.mjs";
import { parsearIndice, urlIndice, urlHtml, limpiarMarcado, tipoDisposicion, anioDelTitulo, localesLPGC, laboralesCanarias } from "../lib/oficial.mjs";
import { generarICS, eventosFestivos } from "../lib/ics.mjs";
import { hoyISO } from "../lib/util.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leerEn = async (raiz, rel, def) => { try { return JSON.parse(await readFile(join(raiz, rel), "utf8")); } catch { return def; } };
const escribirEn = async (raiz, rel, data) => { await mkdir(dirname(join(raiz, rel)), { recursive: true }); await writeFile(join(raiz, rel), typeof data === "string" ? data : JSON.stringify(data, null, 1) + "\n"); };

export async function descargar(url, fetchFn = fetch, intentos = 3) {
  let ultimo;
  for (let k = 0; k < intentos; k++) {
    try {
      const r = await fetchFn(url, { signal: AbortSignal.timeout(25000), headers: { "user-agent": "Vacaciones-GC/1.0 (+github actions)" } });
      if (r.status === 404) return { ok: false, status: 404 };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { ok: true, texto: await r.text() };
    } catch (e) { ultimo = e; await new Promise((res) => setTimeout(res, 800 * (k + 1))); }
  }
  return { ok: false, error: String(ultimo?.message || ultimo) };
}

// Firma estable de una lista de festivos para detectar cambios
const clave = (l) => new Map(l.map((f) => [f.fecha, f.nombre]));
export function diferencias(antes, despues) {
  const a = clave(antes), d = clave(despues), anadidos = [], quitados = [], renombrados = [];
  for (const [f, n] of d) if (!a.has(f)) anadidos.push({ fecha: f, nombre: n }); else if (a.get(f) !== n) renombrados.push({ fecha: f, antes: a.get(f), ahora: n });
  for (const [f, n] of a) if (!d.has(f)) quitados.push({ fecha: f, nombre: n });
  return { anadidos, quitados, renombrados, hay: anadidos.length + quitados.length + renombrados.length > 0 };
}

export async function ejecutar({ fetchFn = fetch, ahora = new Date(), dir = RAIZ, log = console.log, maxNumeros = 400 } = {}) {
  const leer = (rel, def) => leerEn(dir, rel, def), escribir = (rel, data) => escribirEn(dir, rel, data);
  const hoy = hoyISO(undefined, ahora), anioActual = Number(hoy.slice(0, 4));
  const previo = (await leer("data/festivos.json", null)) || (await leer("data/semilla.json", { anios: {} }));
  const estado = await leer("data/estado.json", { boc: {} });
  const salud = { generado: ahora.toISOString(), lecturas: [] };
  const anotar = (nombre, ok, detalle) => { salud.lecturas.push({ nombre, ok, detalle }); log(`${ok ? "✔" : "✖"} ${nombre}${detalle ? ` — ${detalle}` : ""}`); };
  const hallazgos = []; // { anio, tipo, fuente, titulo, url }

  // 1) Recorre los números nuevos del BOC del año en curso (y el siguiente por si ya hubiera)
  for (const anioBoc of [anioActual, anioActual + 1]) {
    let num = (estado.boc?.[anioBoc] || 0) + 1, leidos = 0, ultimo = estado.boc?.[anioBoc] || 0, falloRed = false;
    while (leidos < maxNumeros) {
      const idx = await descargar(urlIndice(anioBoc, num), fetchFn);
      if (!idx.ok) { if (idx.status !== 404 && idx.error) { falloRed = true; anotar(`BOC ${anioBoc}/${num}`, false, idx.error); } break; }
      for (const it of parsearIndice(idx.texto)) {
        const tipo = tipoDisposicion(it.titulo);
        if (tipo) hallazgos.push({ tipo, titulo: it.titulo, url: urlHtml(it.anio, it.num, it.disp), anio: anioDelTitulo(it.titulo), ref: `BOC-A-${it.anio}-${String(it.num).padStart(3, "0")}-${it.disp}` });
      }
      ultimo = num; num++; leidos++;
    }
    if (!falloRed || leidos) estado.boc[anioBoc] = ultimo;
    if (leidos) anotar(`BOC ${anioBoc}`, true, `${leidos} números leídos (último ${ultimo})`);
  }

  // 2) Lee y valida cada disposición relevante
  const nuevoAnios = JSON.parse(JSON.stringify(previo.anios || {}));
  const avisos = [];
  for (const h of hallazgos) {
    if (!h.anio) { avisos.push(`${h.ref}: no se pudo deducir el año del título`); continue; }
    const doc = await descargar(h.url, fetchFn);
    if (!doc.ok) { anotar(h.ref, false, doc.error || `HTTP ${doc.status}`); avisos.push(`${h.ref}: no se pudo leer (${h.url})`); continue; }
    const texto = limpiarMarcado(doc.texto);
    const reg = (nuevoAnios[h.anio] ||= { estado: "estimado", fuente: "", notas: [], festivos: reglas(h.anio).map((x) => ({ ...x })) });
    if (h.tipo === "locales") {
      const loc = localesLPGC(texto, h.anio);
      if (!loc) { anotar(h.ref, false, "no aparece Las Palmas de Gran Canaria"); avisos.push(`${h.ref}: no se encontró Las Palmas de G.C. en la Orden de fiestas locales ${h.anio}`); continue; }
      reg.festivos = reg.festivos.filter((f) => f.tipo !== "local").concat(loc).sort((a, b) => a.fecha.localeCompare(b.fecha));
      reg.localesOficiales = h.ref;
      anotar(h.ref, true, `fiestas locales ${h.anio}: ${loc.map((l) => l.fecha).join(", ")}`);
    } else {
      const r = laboralesCanarias(texto, h.anio);
      if (r.error) { anotar(h.ref, false, r.error); avisos.push(`${h.ref}: ${r.error}. Revísalo y, si hace falta, edita data/manual.json`); continue; }
      const locales = reg.festivos.filter((f) => f.tipo === "local");
      reg.festivos = r.lista.concat(locales).sort((a, b) => a.fecha.localeCompare(b.fecha));
      reg.laboralesOficiales = h.ref;
      anotar(h.ref, true, `calendario de fiestas laborales ${h.anio} (${r.lista.length} festivos comunes)`);
    }
    reg.fuente = [reg.laboralesOficiales && `BOC ${reg.laboralesOficiales}`, reg.localesOficiales && `BOC ${reg.localesOficiales}`].filter(Boolean).join(" + ") || reg.fuente;
    reg.estado = reg.laboralesOficiales && reg.localesOficiales ? "oficial" : reg.laboralesOficiales || reg.localesOficiales ? "parcial" : reg.estado;
    if (reg.localesOficiales) reg.festivos.forEach((f) => { if (f.tipo === "local") delete f.pendienteBOC; });
  }

  // 3) Años cercanos siempre presentes (si no hay datos, calculados con reglas y marcados "estimado")
  for (let a = anioActual; a <= anioActual + 2; a++) if (!nuevoAnios[a]) nuevoAnios[a] = { estado: "estimado", fuente: "Calculado con las reglas oficiales; aún no se ha publicado el calendario de este año.", notas: [], festivos: reglas(a).map((x) => ({ ...x, estimado: true })) };

  // 4) Cambios respecto a lo anterior
  const cambios = await leer("data/cambios.json", { cambios: [] });
  const nuevos = [];
  for (const a of Object.keys(nuevoAnios)) {
    const antes = previo.anios?.[a]?.festivos;
    if (!antes) continue;
    const d = diferencias(antes, nuevoAnios[a].festivos);
    if (d.hay) {
      const c = { detectado: hoy, anio: Number(a), anadidos: d.anadidos, quitados: d.quitados, renombrados: d.renombrados, fuente: nuevoAnios[a].fuente };
      cambios.cambios.push(c); nuevos.push(c);
    }
  }

  const salida = { generado: ahora.toISOString(), anios: nuevoAnios };
  await escribir("data/festivos.json", salida);
  await escribir("data/cambios.json", cambios);
  await escribir("data/estado.json", estado);
  await escribir("data/salud.json", salud);
  const anios = Object.keys(nuevoAnios).filter((a) => Number(a) >= anioActual - 0).map((a) => ({ lista: festivosDelAnio(Number(a), salida).lista }));
  await escribir("data/calendario.ics", generarICS(eventosFestivos(anios), { nombre: "Festivos Las Palmas de Gran Canaria", ahoraISO: ahora.toISOString() }));

  const md = [
    ...nuevos.map((c) => `**Cambio en los festivos de ${c.anio}** (${c.fuente})\n` + [...c.anadidos.map((x) => `- ➕ ${x.fecha}: ${x.nombre}`), ...c.quitados.map((x) => `- ➖ ${x.fecha}: ${x.nombre}`), ...c.renombrados.map((x) => `- ✏️ ${x.fecha}: ${x.antes} → ${x.ahora}`)].join("\n")),
    ...avisos.map((a) => `⚠️ ${a}`),
  ].join("\n\n");
  await escribir("data/nuevos.md", md ? md + "\n" : "");
  log(nuevos.length ? `Cambios detectados: ${nuevos.length}` : "Sin cambios en los festivos");
  return { salida, nuevos, avisos, salud };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutar().catch((e) => { console.error(e); process.exit(1); });
}
