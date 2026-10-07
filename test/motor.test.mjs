import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creaFestivos, pascua, carnavalMartes, reglas } from "../lib/festivos.mjs";
import { tocan, SEMANA_L_V, esLaborable, candidatos, puentes, planOptimo, PRESETS, bloquesActuales, saldo, conflictos, valorDia } from "../lib/motor.mjs";

const datos = JSON.parse(readFileSync(new URL("../data/semilla.json", import.meta.url)));
const mk = (vac = [], bloq = []) => ({ festivos: creaFestivos(datos, {}), semana: SEMANA_L_V, vac: new Set(vac), bloqueados: new Set(bloq) });

test("Pascua y Carnaval", () => {
  assert.equal(pascua(2026), "2026-04-05"); assert.equal(pascua(2027), "2027-03-28");
  assert.equal(carnavalMartes(2026), "2026-02-17"); assert.equal(carnavalMartes(2027), "2027-02-09");
});
test("las reglas reproducen los calendarios oficiales verificados", () => {
  for (const a of [2026, 2027]) {
    const real = new Set(datos.anios[a].festivos.map((f) => f.fecha));
    const calc = new Set(reglas(a).map((f) => f.fecha));
    // 2026: el único traslado "extra" que fija Canarias es 2 nov (domingo→lunes, lo da la regla) y 7 dic no es festivo
    const sobran = [...calc].filter((d) => !real.has(d)), faltan = [...real].filter((d) => !calc.has(d));
    assert.deepEqual(faltan, [], `faltan en reglas ${a}`);
    assert.deepEqual(sobran, a === 2026 ? ["2026-12-07"] : [], `sobran en reglas ${a}`);
  }
});
test("festivos 2026 en Gran Canaria", () => {
  const c = mk();
  assert.equal(c.festivos.get("2026-12-08").nombre, "Inmaculada Concepción");
  assert.equal(c.festivos.get("2026-12-07"), null);
  assert.equal(c.festivos.get("2026-11-02") != null, true);
  assert.equal(esLaborable(c, "2026-12-07"), true);
  assert.equal(esLaborable(c, "2026-12-08"), false);
});
test("un año sin datos usa reglas y se marca estimado", () => {
  const c = mk(); const y = c.festivos.anio(2028);
  assert.equal(y.estado, "estimado"); assert.ok(y.lista.length >= 14);
});
test("pedir el lunes 7 dic 2026 regala el puente de la Inmaculada: 4 días por 1", () => {
  const c = mk(); const p = puentes(c, 2026, { maxCoste: 3 });
  const m = p.find((x) => x.pedir.join() === "2026-12-07");
  assert.ok(m); assert.equal(m.ini, "2026-12-05"); assert.equal(m.fin, "2026-12-08"); assert.equal(m.libres, 4);
});
test("candidatos: bloque exacto de Navidad 2026", () => {
  const c = mk(); const cs = candidatos(c, 2026, { maxCoste: 5, desde: "2026-12-20" });
  const v = cs.find((x) => x.pedir.join() === "2026-12-28,2026-12-29,2026-12-30,2026-12-31");
  assert.ok(v); assert.equal(v.ini, "2026-12-25"); assert.equal(v.fin, "2027-01-03"); assert.equal(v.libres, 10);
});
test("saldo y bloques actuales", () => {
  const c = mk(["2026-12-07", "2026-12-09"]);
  assert.deepEqual(saldo(c, { diasAnuales: 22, arrastrados: 0, extra: 0 }, 2026), { total: 22, usados: 2, restantes: 20 });
  const b = bloquesActuales(c, 2026);
  assert.equal(b.length, 1); assert.equal(b[0].ini, "2026-12-05"); assert.equal(b[0].fin, "2026-12-09"); assert.equal(b[0].libres, 5);
});
test("conflictos cuando un día elegido pasa a ser festivo", () => {
  const c = mk(["2026-12-08", "2026-12-14"]);
  const k = conflictos(c); assert.equal(k.length, 1); assert.match(k[0].motivo, /festivo/);
});
test("plan óptimo respeta presupuesto, no se toca entre bloques y rinde más que pedir sueltos", () => {
  const c = mk();
  for (const [clave, p] of Object.entries(PRESETS)) {
    const plan = planOptimo(c, 2026, { ...p, presupuesto: 12 });
    assert.ok(plan.coste <= 12, clave); assert.ok(plan.ganados > 0, clave);
    for (let i = 1; i < plan.bloques.length; i++) assert.ok(!tocan(plan.bloques[i], plan.bloques[i - 1]), `${clave} solapa o se pega`);
    assert.ok(plan.bloques.length <= p.maxBloques);
  }
  const r = planOptimo(c, 2026, { ...PRESETS.rendimiento, presupuesto: 12 });
  assert.ok(r.libres / r.coste >= 2.5, `ratio ${r.libres / r.coste}`);
});
test("plan con ancla de verano incluye un bloque largo entre junio y septiembre", () => {
  const c = mk(); const plan = planOptimo(c, 2027, { ...PRESETS.verano, presupuesto: 22 });
  assert.ok(plan.bloques.some((b) => b.coste >= 10 && [6, 7, 8, 9].includes(b.mes)));
  assert.ok(plan.coste <= 22);
});
test("el plan no pisa días ya elegidos ni días bloqueados", () => {
  const c = mk(["2027-08-02", "2027-08-03"], ["2027-12-27", "2027-12-28", "2027-12-29", "2027-12-30", "2027-12-31"]);
  const plan = planOptimo(c, 2027, { ...PRESETS.rendimiento, presupuesto: 10 });
  const usados = plan.bloques.flatMap((b) => b.pedir);
  assert.ok(!usados.includes("2027-08-02")); assert.ok(!usados.some((d) => d.startsWith("2027-12-3") || d === "2027-12-27"));
  for (const b of plan.bloques) assert.ok(b.ini > "2027-08-06" || b.fin < "2027-07-31");
});
test("valor de un día: lunes 7 dic = 4, un miércoles cualquiera = 1", () => {
  const c = mk(); assert.equal(valorDia(c, "2026-12-07"), 4); assert.equal(valorDia(c, "2026-10-14"), 1);
});
test("semana de 6 días laborables (sábado se trabaja)", () => {
  const c = { ...mk(), semana: new Set([1, 2, 3, 4, 5, 6]) };
  assert.equal(esLaborable(c, "2026-10-10"), true);
});
