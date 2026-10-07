import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diferencias } from "../scripts/update.mjs";
import { localesLPGC, parsearIndice, tipoDisposicion, laboralesCanarias, anioDelTitulo } from "../lib/oficial.mjs";

const TIT_LOC = "ORDEN de 6 de agosto de 2025, por la que se determinan las fiestas locales propias de cada municipio de la Comunidad Autónoma de Canarias para el año 2026";
test("clasifica títulos del BOC", () => {
  assert.equal(tipoDisposicion(TIT_LOC), "locales"); assert.equal(anioDelTitulo(TIT_LOC), 2026);
  assert.equal(tipoDisposicion("DECRETO 70/2026, de 12 de junio, por el que se determina el calendario de fiestas laborales de la Comunidad Autónoma de Canarias para el año 2027"), "laborales");
  assert.equal(tipoDisposicion("RESOLUCIÓN por la que se convoca un proceso selectivo de técnicos informáticos"), null);
});
test("localesLPGC lee la estructura real del BOC", () => {
  const t = "INGENIO.\n2 de febrero: Festividad de Nuestra Señora de la Candelaria.\n29 de junio: Festividad del Apóstol San Pedro.\nLAS PALMAS DE GRAN CANARIA.\n17 de febrero: Martes de Carnaval.\n24 de junio: Conmemoración de la Fundación de la Ciudad.\nLOS LLANOS DE ARIDANE.\n1 de enero: otra";
  const r = localesLPGC(t, 2026);
  assert.deepEqual(r.map((x) => x.fecha), ["2026-02-17", "2026-06-24"]);
  assert.equal(localesLPGC("INGENIO.\n2 de febrero: x.", 2026), null);
});
test("decreto de 2027: traslado del 15 al 16 de agosto sin dar el domingo por festivo", () => {
  const d = "DECRETO 70/2026, de 12 de junio, por el que se determina…\nArtículo 1.- además de las fiestas del 1 de enero; 6 de enero; 25 de marzo; 26 de marzo; 1 de mayo; 30 de mayo; 16 de agosto (Asunción), que se traslada al lunes por coincidir el 15 de agosto en domingo; 12 de octubre; 1 de noviembre; 6 de diciembre; 8 de diciembre; y 25 de diciembre.\nArtículo 2.- el 2 de febrero (Tenerife); el 8 de septiembre (Gran Canaria)";
  const r = laboralesCanarias(d, 2027);
  assert.ok(!r.error, r.error); assert.ok(r.lista.some((f) => f.fecha === "2027-08-16")); assert.ok(!r.lista.some((f) => f.fecha === "2027-08-15")); assert.ok(!r.lista.some((f) => f.fecha === "2027-02-02"));
});
test("un texto raro no se aplica", () => { assert.ok(laboralesCanarias("Artículo 1. nada que ver, 3 de enero y 4 de marzo", 2027).error); });
test("diferencias detecta altas, bajas y renombrados", () => {
  const d = diferencias([{ fecha: "2026-12-07", nombre: "A" }, { fecha: "2026-12-08", nombre: "B" }], [{ fecha: "2026-12-08", nombre: "C" }, { fecha: "2026-12-09", nombre: "D" }]);
  assert.equal(d.anadidos.length, 1); assert.equal(d.quitados.length, 1); assert.equal(d.renombrados.length, 1);
});
test("parsearIndice y ejecución completa con red simulada", async () => {
  const idx = `<a href="/boc/2026/001/boc-a-2026-001-3029.pdf">${TIT_LOC.replace("2026", "2027")}</a>`;
  const doc = "<p>ORDEN</p><p>LAS PALMAS DE GRAN CANARIA.</p><p>10 de febrero: Martes de Carnaval.</p><p>25 de junio: Conmemoración de la Fundación de la Ciudad.</p><p>LOS LLANOS DE ARIDANE.</p>";
  assert.equal(parsearIndice(idx).length, 1);
  const { ejecutar } = await import("../scripts/update.mjs");
  const respuestas = (url) => {
    if (/\/boc\/2026\/001\/index/.test(url)) return { ok: true, status: 200, text: async () => idx };
    if (/\/boc\/2026\/001\/3029\.html/.test(url)) return { ok: true, status: 200, text: async () => doc };
    return { ok: false, status: 404, text: async () => "" };
  };
  const { writeFile, rm } = await import("node:fs/promises");
  const archivos = ["festivos.json", "cambios.json", "estado.json", "salud.json", "calendario.ics", "nuevos.md"];
  const originales = {};
  for (const f of archivos) originales[f] = await readFile(new URL(`../data/${f}`, import.meta.url), "utf8").catch(() => null);
  const r = await ejecutar({ fetchFn: async (u) => respuestas(u), log: () => {}, ahora: new Date("2026-10-07T05:17:00Z") });
  const loc = r.salida.anios[2027].festivos.filter((f) => f.tipo === "local").map((f) => f.fecha);
  assert.deepEqual(loc, ["2027-02-10", "2027-06-25"]);
  assert.equal(r.nuevos.length, 1); assert.equal(r.nuevos[0].anio, 2027);
  // restaurar datos del repo tocados por la prueba
  for (const f of archivos) { const u = new URL(`../data/${f}`, import.meta.url); if (originales[f] === null) await rm(u, { force: true }); else await writeFile(u, originales[f]); }
});
