# Vacaciones GC

Planificador de vacaciones para trabajar en **Las Palmas de Gran Canaria**: sabe qué días son festivos (nacionales, de Canarias, la Virgen del Pino y los dos locales de la capital), busca los puentes más rentables, reparte tus días en un plan óptimo del año y se **actualiza solo** si cambia algún festivo. App web instalable (PC y móvil), sin servidor ni APIs de pago. Misma idea que Radar-Opos-TIC.

## Qué hace

Tres pestañas (en móvil, barra inferior) y un engranaje para Ajustes; el año se cambia arriba.

- **Inicio**: anillo con tu saldo, botones para **guardar días para el año siguiente** y **dejar reserva para imprevistos**, avisos (días que caducan, conflictos con festivos), próximas vacaciones y mejores puentes.
- **Calendario**: vista *Mes*, *Año* o *Festivos* (con estado oficial/parcial/estimado y fuente). Toca para marcar *Vacaciones*, *No disponible* o *Pareja*; modo rango; mapa de calor; copiar solicitud; exportar `.ics`; imprimir.
- **Descubrir**: *Puentes* (ranking días libres / días pedidos) y *Plan*, donde eliges cómo quieres tus vacaciones: navidades normales o largas, verano de 1, 2 o 3 semanas y qué meses, Semana Santa, distribución (concentrada, equilibrada o repartida), qué priorizar y cuántos días reservar. Compara 3 planes óptimos (programación dinámica) y aplicas el que prefieras.
- **Ajustes**: días anuales, *Días sin disfrutar* (máximo que se puede guardar, por defecto 5, y fecha de caducidad **opcional**: sin activarla, los días guardados no caducan), extras por año, días de empresa, jornada, tema, copia de seguridad, pareja y sincronización con GitHub.

### Días sin disfrutar

Los días que guardas de un año entran en el siguiente como "entrantes" y el plan los coloca primero, antes de su fecha de caducidad. Si activas la caducidad y no los usas a tiempo, se muestran como perdidos. Ajusta el máximo y la fecha según tu convenio.

## Cómo se mantienen los festivos

`scripts/update.mjs` corre cada día en GitHub Actions:

1. Recorre los números nuevos del **BOC** y busca dos tipos de disposición: el decreto de fiestas laborales de Canarias y la Orden de fiestas locales de los municipios.
2. Del decreto saca los festivos comunes (descarta las fiestas de otras islas y el domingo de origen de un traslado); de la Orden saca las fiestas de *Las Palmas de Gran Canaria*.
3. **Valida** antes de aplicar: si el texto no cuadra con lo esperado (pocas fechas, demasiadas diferencias) no toca nada y lo avisa.
4. Compara con la versión anterior; si hay diferencias las guarda en `data/cambios.json`, la app las enseña y **abre un Issue** (GitHub Mobile te lo notifica). Si un día que habías marcado como vacaciones pasa a ser festivo, la app te lo marca como conflicto y puedes liberarlo.
5. Regenera `data/festivos.json` y `data/calendario.ics`.

Estados: **oficial** (decreto y locales leídos del BOC), **parcial** (falta algo, p. ej. las locales aún sin publicar) y **estimado** (reglas de calendario; se corrige solo al publicarse).

### Datos verificados al crear el proyecto (7-oct-2026)

- **2026**: oficial. Canarias traslada Todos los Santos al lunes 2 nov. **El lunes 7 dic NO es festivo en Canarias** (fuentes discrepantes; si tu empresa lo aplica, añádelo en *Ajustes → Días de empresa*). Locales: 17 feb y 24 jun (BOC-A-2025-165-3029).
- **2027**: parcial. Decreto de Canarias: el 15 ago pasa al lunes 16. Locales aprobadas por el Pleno: 9 feb y 24 jun (a falta de publicarse en el BOC).

> El lector del BOC está probado con textos reales de ejemplo, pero **no se ha podido probar contra el BOC en vivo** desde el entorno donde se creó. Mira *Festivos → Estado de las lecturas* tras la primera ejecución en Actions.

## Puesta en marcha

1. Crea un repositorio **público** `Vacaciones-GC` y sube esta carpeta a `master`.
2. *Settings → Pages → Source: GitHub Actions*.
3. *Actions → Actualizar festivos y publicar → Run workflow* (la primera vez recorre los números del BOC del año).
4. Abre la URL de Pages en el móvil y añádela a la pantalla de inicio. Instala GitHub Mobile para los avisos.

## Sincronizar tus vacaciones entre dispositivos

*Ajustes → Sincronizar con GitHub*: token fino con permiso **Contents: Read and write** sobre este repositorio. Se guarda en `data/mis-vacaciones.json`. Con repo público **no escribas nada sensible**.

## Mantenimiento

- Corregir o añadir festivos a mano: `data/manual.json` → `{ "anadir": [{"fecha":"2026-12-07","nombre":"…"}], "quitar": ["2026-…"] }`.
- Datos base verificados: `data/semilla.json`.
- Tests: `node --test test/*.test.mjs`.

## Ideas pendientes

Notificaciones push reales, soporte para otros municipios de Canarias (el motor ya es genérico: solo cambia la Orden de fiestas locales), importar el calendario laboral del convenio, y vista de equipo para coordinar con compañeros.
