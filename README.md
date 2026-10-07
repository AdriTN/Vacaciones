# Vacaciones GC

Planificador de vacaciones para trabajar en **Las Palmas de Gran Canaria**: sabe qué días son festivos (nacionales, de Canarias, la Virgen del Pino y los dos locales de la capital), busca los puentes más rentables, reparte tus días en un plan óptimo del año y se **actualiza solo** si cambia algún festivo. App web instalable (PC y móvil), sin servidor ni APIs de pago. Misma idea que Radar-Opos-TIC.

## Qué hace

- **Inicio**: saldo de días, aviso de urgencia si te sobran días y quedan pocos laborables, próximas vacaciones, mejores puentes que vienen, próximos festivos y avisos.
- **Calendario**: los 12 meses; toca para marcar *Vacaciones*, *No disponible* o *Pareja*; modo rango; **mapa de calor** (qué días rinden más); bloques resultantes con su rendimiento; copiar solicitud lista para enviar; exportar `.ics` con avisos 7 días y 1 día antes; imprimir.
- **Puentes**: ranking de combinaciones (`días libres seguidos / días pedidos`) con filtro de días máximos; añadir o quitar con un toque.
- **Plan**: 4 estrategias comparadas (*Máximo rendimiento*, *Equilibrado*, *Verano largo + puentes*, *Semana Santa y Navidad*). Optimización exacta por programación dinámica: bloques que no se tocan, dentro de tu presupuesto, respetando lo ya marcado y tus días no disponibles.
- **Festivos**: lista completa del año con estado (**oficial / parcial / estimado**), fuente, notas, festivos que caen en fin de semana, cambios detectados, suscripción `.ics` y estado de las lecturas.
- **Ajustes**: días anuales, extra/arrastrados por año, margen tras el 31 dic, días que trabajas (por si sábado es laborable), días de empresa, tema, copia de seguridad, importar a tu pareja (ver días libres en común), sincronizar con GitHub.

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
