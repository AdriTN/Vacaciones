import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diasEntre } from "../lib/util.mjs";
import { creaFestivos, pascua, carnavalMartes, reglas } from "../lib/festivos.mjs";
import { DISTRIBUCIONES, planConArrastre, tocan, SEMANA_L_V, esLaborable, candidatos, puentes, planOptimo, PRESETS, bloquesActuales, saldo, conflictos, valorDia } from "../lib/motor.mjs";

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
  const sd = saldo(c, { diasAnuales: 22, extra: 0 }, 2026); assert.deepEqual([sd.total, sd.usados, sd.restantes], [22, 2, 20]);
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

test("saldo con días guardados: caducan en la fecha límite y se pueden guardar hasta el máximo", () => {
  const cfg = { diasAnuales: 22, entrantes: 4, limiteEntrantes: "2026-03-31", arrastreMax: 5, hoy: "2026-02-01" };
  let s = saldo(mk(["2026-03-02", "2026-03-03"]), cfg, 2026);
  assert.equal(s.total, 26); assert.equal(s.entrantesEnRiesgo, 2); assert.equal(s.caducados, 0); assert.equal(s.restantes, 24);
  s = saldo(mk(["2026-03-02", "2026-03-03"]), { ...cfg, hoy: "2026-04-10" }, 2026);
  assert.equal(s.caducados, 2); assert.equal(s.restantes, 22);       // 2 de los 4 guardados se perdieron
  s = saldo(mk(["2026-05-04"]), { ...cfg, hoy: "2026-06-01", guardar: 9 }, 2026);
  assert.equal(s.guardables, 5); assert.equal(s.guardar, 5);         // tope de la empresa
  assert.equal(saldo(mk(), { diasAnuales: 22, arrastreMax: 0, guardar: 3 }, 2026).guardar, 0);
});
test("plan con arrastre coloca antes de la fecha límite los días que caducan", () => {
  const c = mk(); const plan = planConArrastre(c, 2027, { ...PRESETS.rendimiento, presupuesto: 12, riesgo: 4, limite: "2027-03-31", desde: "2027-01-01" });
  const antes = plan.bloques.flatMap((b) => b.pedir).filter((d) => d <= "2027-03-31").length;
  assert.ok(antes >= 4, `solo ${antes} antes del límite`); assert.ok(plan.coste <= 12);
  for (let i = 1; i < plan.bloques.length; i++) assert.ok(!tocan(plan.bloques[i], plan.bloques[i - 1]));
});

test("Navidad larga: el plan coloca un bloque grande en diciembre", () => {
  const c = mk(); const navidad = (a) => (b) => b.pedir.some((d) => d >= `${a}-12-21`) && b.fin >= `${a}-12-26`;
  const plan = planOptimo(c, 2027, { ...DISTRIBUCIONES.equilibrada, presupuesto: 22, anclas: [{ min: 6, max: 9, filtro: navidad(2027) }] });
  const nav = plan.bloques.find((b) => b.pedir.some((d) => d >= "2027-12-21"));
  assert.ok(nav && nav.coste >= 6 && nav.coste <= 9, JSON.stringify(nav?.pedir)); assert.equal(plan.anclasCumplidas, 1);
});
test("Verano + Navidad a la vez, y si no caben se avisa", () => {
  const c = mk(); const navidad = (b) => b.pedir.some((d) => d >= "2027-12-21") && b.fin >= "2027-12-26";
  const dos = planOptimo(c, 2027, { ...DISTRIBUCIONES.equilibrada, presupuesto: 22, anclas: [{ min: 9, max: 11, meses: [7, 8] }, { min: 6, max: 9, filtro: navidad }] });
  assert.equal(dos.anclasCumplidas, 2); assert.ok(dos.coste <= 22);
  const poco = planOptimo(c, 2027, { ...DISTRIBUCIONES.equilibrada, presupuesto: 8, anclas: [{ min: 9, max: 11, meses: [7, 8] }, { min: 6, max: 9, filtro: navidad }] });
  assert.ok(poco.anclasCumplidas < 2);
});
test("Repartida respeta la separación mínima entre bloques", () => {
  const plan = planOptimo(mk(), 2027, { ...DISTRIBUCIONES.repartida, presupuesto: 14 });
  assert.ok(plan.bloques.length >= 3);
  for (let i = 1; i < plan.bloques.length; i++) assert.ok(diasEntre(plan.bloques[i - 1].fin, plan.bloques[i].ini) - 1 >= 21, "separación");
});
test("Concentrada usa pocos bloques largos", () => {
  const plan = planOptimo(mk(), 2027, { ...DISTRIBUCIONES.concentrada, presupuesto: 22 });
  assert.ok(plan.bloques.length <= 3); assert.ok(plan.bloques.every((b) => b.libres >= 8));
});
test("reserva de imprevistos reduce los días a repartir", () => {
  const s = saldo(mk(), { diasAnuales: 22, reserva: 3, arrastreMax: 5, guardar: 2 }, 2026);
  assert.equal(s.reserva, 3); assert.equal(s.aUsar, 17);
  assert.equal(saldo(mk(), { diasAnuales: 22, reserva: 99 }, 2026).reserva, 22);
});

test("sin fecha de caducidad los días guardados nunca se pierden", () => {
  const s = saldo(mk(), { diasAnuales: 22, entrantes: 4, limiteEntrantes: null, hoy: "2027-12-01" }, 2027);
  assert.equal(s.caducados, 0); assert.equal(s.limiteEntrantes, null); assert.equal(s.restantes, 26);
});
test("el plan indica qué preferencia no cabe", () => {
  const r = planOptimo(mk(), 2026, { ...DISTRIBUCIONES.equilibrada, presupuesto: 20, desde: "2026-10-07", anclas: [{ id: "verano", min: 9, max: 11, meses: [6, 7, 8, 9] }] });
  assert.deepEqual(r.anclasNo, ["verano"]);
});

test("días ya disfrutados antes de usar la app restan del saldo", () => {
  const s = saldo(mk(), { diasAnuales: 22, gastados: 9 }, 2026);
  assert.equal(s.restantes, 13); assert.equal(s.gastados, 9);
});
