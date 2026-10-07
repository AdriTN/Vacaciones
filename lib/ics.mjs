// Calendarios iCalendar (.ics): festivos públicos y plan personal de vacaciones.
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const plegar = (l) => (l.length <= 74 ? l : l.match(/.{1,73}/g).join("\r\n "));
const dia = (i) => i.replaceAll("-", "");
const sig = (i) => { const d = new Date(i + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replaceAll("-", ""); };

// eventos: [{uid, fecha, fin?(incluido), resumen, descripcion?, aviso?:[triggers]}]
export function generarICS(eventos, { nombre, ahoraISO, prodid = "Vacaciones-GC" }) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${prodid}//ES`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(nombre)}`, "X-WR-TIMEZONE:Atlantic/Canary", "REFRESH-INTERVAL;VALUE=DURATION:PT12H"];
  const stamp = ahoraISO.replace(/[-:]/g, "").replace(/\.\d+/, "");
  for (const e of eventos) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}@vacaciones-gc`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dia(e.fecha)}`, `DTEND;VALUE=DATE:${sig(e.fin || e.fecha)}`,
      `SUMMARY:${esc(e.resumen)}`, ...(e.descripcion ? [`DESCRIPTION:${esc(e.descripcion)}`] : []), "TRANSP:TRANSPARENT");
    for (const t of e.aviso || []) L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.resumen)}`, `TRIGGER:${t}`, "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(plegar).join("\r\n") + "\r\n";
}

export const eventosFestivos = (anios) => anios.flatMap(({ lista }) => lista).filter((f) => f.tipo !== "empresa")
  .map((f) => ({ uid: `festivo-${f.fecha}`, fecha: f.fecha, resumen: `🎉 ${f.nombre}`, descripcion: `Festivo en Las Palmas de Gran Canaria (${f.tipo})` }));
export const eventosVacaciones = (bloques) => bloques.map((b) => ({
  uid: `vac-${b.pedir[0]}`, fecha: b.ini, fin: b.fin, resumen: `🏖️ Vacaciones (${b.coste} ${b.coste === 1 ? "día" : "días"} pedidos)`,
  descripcion: `Del ${b.ini} al ${b.fin}: ${b.libres} días libres seguidos. Días a pedir: ${b.pedir.join(", ")}`, aviso: ["-P7DT15H", "-PT15H"],
}));
