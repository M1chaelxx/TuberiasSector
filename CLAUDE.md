# TuberiasSector — Instrucciones para Claude

## Entrega de archivos al terminar cada versión

**OBLIGATORIO al terminar cada versión (cada vez que se haga un commit con número V###):**

1. Ejecutar `npm run build` para generar el `dist/`
2. Enviar siempre el dist:
   - `TubySol_V###_dist.zip` → contenido de `dist/` (para subir a Cloudflare Pages) — **en cada versión**
3. Enviar el source cada 3 versiones (V159, V162, V165…):
   - `TuberiasSector_SOURCE_V###.zip` → código fuente completo sin `node_modules/` ni `dist/`

### Nomenclatura de los zips

```
TubySol_V153_dist.zip          ← dist para Cloudflare
TuberiasSector_SOURCE_V153.zip ← código fuente completo
```

### Ruta del scratchpad para los zips

```
/tmp/claude-0/-home-user-TuberiasSector/0da42e6d-4f6f-5fe3-bd62-7b9568241b22/scratchpad/
```

### Comandos estándar para generar los zips

```bash
SCRATCHPAD="/tmp/claude-0/-home-user-TuberiasSector/0da42e6d-4f6f-5fe3-bd62-7b9568241b22/scratchpad"
VER="V###"

# Dist
zip -r "$SCRATCHPAD/TubySol_${VER}_dist.zip" dist/

# Fuente completa
zip -r "$SCRATCHPAD/TuberiasSector_SOURCE_${VER}.zip" . \
  --exclude ".git/*" \
  --exclude "node_modules/*" \
  --exclude "dist/*" \
  --exclude "test-results/*"
```

## Stack técnico

- React 19 + Vite 8 PWA
- Firebase Firestore con `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`
- HashRouter (obligatorio para hosting estático)
- Cloudflare Workers para deploy (el proyecto siempre estuvo en Workers; antes decía Pages por error)

## Almacenamiento de fotos — SIEMPRE Cloudinary

**TODAS las fotos de la app (soldadura, tuberías, avisos) van a Cloudinary. NUNCA Firebase Storage.**

- `cloud_name`: `vgia9y4h`
- `upload_preset`: `tuberia_fotos`
- Carpetas por sección:
  - `soldadura_fotos/` → fotos de soldadura
  - `tuberia_fotos/` → fotos de tuberías
  - `avisos_fotos/` → fotos del tablón de avisos
- El componente `PhotoGrid.jsx` ya sube a Cloudinary directamente
- Las URLs de Cloudinary se guardan en Firestore: `{ url: '...', public_id: '...', nombre: '...' }`
- **Nunca usar** `firebase/storage`, `uploadBytes`, `getDownloadURL` para fotos de la app

## Decisiones de diseño (NO revertir por error)

- **Operario y valoración son exclusivos de Soldadura.** En Tuberías se miden máquinas, no personas: no interesa quién tomó la medición ni se pondera el ritmo del operario, y por eso el nombre tampoco va en la exportación de tuberías. Si en un futuro Tuberías aparece "sin operario", **no es una pérdida de funcionalidad** — es intencional. Tuberías guarda solo `tiempoObs`, `fecha` y `comentario`.
- **Un subconjunto de Soldadura que se repite con el mismo código en más de un modelo comparte sus tiempos** (ej: SC187 "Entrada Distribuidor Bronce" existe igual en "Inverter EZ R32" y en "Inverter GP R32") — mismo criterio que ya regía para las piezas SP/AD/PP de Tuberías, extendido a Soldadura en V286. Si en el futuro se ve un subconjunto "sin mediciones" en un modelo que comparte código con otro que sí las tiene, **es un bug a corregir**, no el comportamiento esperado.

## Versión actual

V315 — Tuberías: exportar "Solo promedios" (una fila por plano y máquina) + Título/Equipos completos:
- Pedido con el PDF real (tiempos-tuberia 11-11-2026): el export de Resumen Tiempos repetía todas las mediciones de cada caño (10–15 filas por plano) y solo al final traía el promedio. Se necesita **una fila por caño y por máquina con el tiempo promedio de demora**, ordenado por plano; si un plano se midió en dos máquinas salen dos filas
- `TuberiasTiempos.jsx`: nuevo selector "Exportar: Todas las mediciones / Solo promedios" sobre los botones PDF y Excel (el modo "Todas las mediciones" es el de siempre, sin cambios). Con "Solo promedios", `filasPromedio()` arma las filas y el **PDF** (`exportPDFPromedios`) trae Plano, Título, Equipos, Máquina, Med., Tiempo prom. (mm:ss:cc), Vel. prom. y Fecha (o rango de fechas si se midió en varios días); el **Excel** (`exportExcelPromedios`, hoja "Promedios") suma además "Tiempo promedio (s)" numérico y "Vel. promedio (%)" para poder analizar. Respeta el día elegido en el calendario y la pestaña de máquina activa. Archivos `tiempos-tuberia-promedios-<fecha>.pdf/.xlsx`
- Fix: en el PDF real "Título" y "Equipos" salían como "-". Ahora el título toma el primero no vacío de la pieza y, si no hay, el código de caño (igual que Cobertura), y la búsqueda en `tuberia_bd` también prueba el plano como número por si alguna importación vieja lo guardó así (cada consulta falla en silencio sin trabar el resto). **Si siguen saliendo "-", ese plano no está en el catálogo (`tuberia_bd`) con ese número**
- Verificado con datos de prueba armados como el PDF (promedio, velocidad faltante, rango de fechas, filtro de día y de máquina)

### V314 — Plan semanal y mensual + tareas de cada puesto en gráfico de cascada:
- Pedido: (1) además del plan semanal, poder armar uno **mensual**; (2) en los dos, mostrar las tareas de cada puesto con un **gráfico tipo cascada, lineal** (barras horizontales)
- `SoldaduraPlanSemanal.jsx` (título "Plan semanal y mensual", chip del Inicio "📅 Plan semanal/mensual"): selector **Semana / Mes**. En el mes se elige el mes (`mesesDe`), la tabla Puestos × días muestra **solo los días con producción** de la línea (`diasDeMes`, columna Puesto fija al desplazar) y la columna total pasa a "Mes"; tarjetas, alertas y textos dicen "del mes". Horas/eficiencia se guardan por período: `config/plan_semanal` → `{linea|lunes}` (semana) o `{linea|YYYY-MM}` (mes)
- **Turnos por día** ahora valen por fecha para la semana y el mes: se guardan en `config/plan_semanal` → `{linea|turnos} = { 'YYYY-MM-DD': n | null }` (`null` = volver al Excel). Se siguen leyendo los turnos guardados dentro de cada semana en V312/V313 (y `guardarParam` los conserva)
- **Cascada** (componente `Cascada`): por puesto, una fila por tarea (código · descripción, modelo · unidades); cada barra arranca donde terminó la anterior (orden: modelo con más carga primero y, dentro, de la tarea más larga a la más corta), fila "Total del puesto", **línea punteada = fin del tiempo disponible** y en **rojo lo que no entra**. Selector por puesto: todo el período o un día puntual. La tabla de cantidades quedó debajo, plegada ("Ver cantidades por día/semana"): en la semana una columna por día, en el mes **una por semana** (rango de fechas)
- `planSemanalCalc.js`: `calcularPlan` acepta `fechas` (lista fija, para el mes); nuevos `mesesDe`, `diasDeMes`, `gruposDias` (días o semanas), `celdaGrupo`, `cascadaDePuesto`; `tareasDePuesto(puesto, grupos)` ahora recibe grupos
- `exportPlanSemanalPdf.js` (`{plan, planLinea, lineaSol, periodo, esMes, horas, eficPct}`): "Plan semanal" o "Plan mensual"; en el mes la tabla principal va **por semana** (el detalle diario queda en las alertas); cada puesto en su página con la **cascada dibujada** (`dibujarCascada`) y la tabla de cantidades. Archivo `Plan_semanal_…` / `Plan_mensual_<línea>_<YYYY-MM>.pdf`
- No cambia ningún cálculo de V311–V313. Verificado con el Excel real (octubre ODU II: 21 días con producción, 11.604 equipos) y datos de prueba; cascada renderizada en Chromium (escritorio y celular) y PDF revisado como imagen

### V313 — Plan semanal: cuánto falta cada día (tiempo y equipos que no salen):
- Pedido (opción 1 de las sugeridas en V312): en los puestos/días que pasan el turno, mostrar cuánto falta para decidir horas extra o mover equipos a otro día
- `planSemanalCalc.js`: cada celda puesto/día suma `faltaSeg` = tiempo necesario − disponible (si es positivo) y `faltaEq` = equipos que no alcanzaría a hacer, a la mezcla de ese día = ⌈equipos del día × faltaSeg ÷ tiempo necesario⌉ (sin turno = todos). Por puesto: `faltaSeg` de la semana = suma de lo que falta cada día (un día que sobra no compensa otro que falta). Por día: `faltaEq` = el del puesto que más limita (la línea sale al ritmo del más lento). Total semana: `plan.faltaSeg` (horas-persona extra) y `plan.faltaEq`. Nuevo `faltaTexto()`
- `SoldaduraPlanSemanal.jsx`: celdas en rojo con "falta 2h 31m · 87 eq", cabecera de cada día con "no salen N eq", tarjeta nueva "Lo que falta en la semana", alertas con el faltante primero, y lo mismo en las tarjetas de tareas de cada puesto. `exportPlanSemanalPdf.js`: mismos datos en la tabla, cabeceras, alertas y títulos de cada puesto
- No cambia los % ni los tiempos de V312 (es información agregada). Verificado: 17h 04m necesarias contra 14h 33m disponibles → falta 2h 31m → 582 × 2h31m ÷ 17h04m = 86,03 → 87 equipos

### V312 — Plan semanal: tareas de todos los puestos a la vista, turnos editables por día e impresión en PDF:
- Pedido con captura (Portable R32 12FC, ODU II): (1) ver las tareas de **todos** los puestos, no solo del que se toca; (2) poder modificar la cantidad de turnos; (3) poder imprimirlo
- `SoldaduraPlanSemanal.jsx`: debajo de la tabla Puestos × días ahora aparece una tarjeta por puesto con sus tareas (modelo · tarea, unidades y tiempo de cada día, % del día en la cabecera, % y tiempo de la semana), con "Ocultar / Ver las de los N puestos". Tocar un puesto en la tabla lleva a su tarjeta
- **Turnos por día editables**: fila "Turnos por día" en el bloque de parámetros (arranca con los del Excel; el que se cambia queda en azul y con ✎ en la cabecera del día; "↺ Volver a los del Excel"). Se guardan en `config/plan_semanal` → `{linea|lunes}.turnos = { 'YYYY-MM-DD': n }` (la entrada de la semana se escribe completa con `mergeFields`, así se pueden quitar). Producción solo lee. `calcularPlan` recibe `turnosOverride`; 0 turnos con carga se muestra "sin turno" (rojo) y entra en las alertas
- Nuevo `exportPlanSemanalPdf.js` (jsPDF + autoTable, A4 apaisado) y botón "🖨 Imprimir (PDF)": encabezado (línea, semana, equipos, horas/eficiencia), tabla Puestos × días con los colores del semáforo y los turnos de cada día (marca "manual"), alertas de sobrecarga, una tabla de tareas por puesto y la lista de modelos con su estado. Archivo `Plan_semanal_<línea>_<lunes>.pdf`
- `planSemanalCalc.js`: nuevos `tareasDePuesto`, `nivel`, `pctTexto` (compartidos por pantalla y PDF). No cambia ningún cálculo de V311 ni otros datos. Verificado con el Excel real y datos de prueba (SC165 582 × 0:45,8 = 7h 24m, igual a la captura)

### V311 — Soldadura: nueva pantalla "📅 Plan semanal" (puestos × días contra la secuencia de producción):
- Pedido: unificar los puestos ya armados de cada modelo con la secuencia (Excel) para organizar la semana: cuánto tiempo necesita cada puesto cada día contra el turno. Acordado con el usuario: el "Puesto N" de un modelo es **el mismo puesto/persona** que el "Puesto N" de los otros modelos de la línea (se une por nombre del puesto); vista día a día + total semanal; plan por línea (IDU / ODU I / ODU II = soldadura IDU / ODU / ODU2); modelos sin puestos o sin tiempos → "Falta armar" y **no cuentan**; el tiempo de cambio de modelo **no se calcula ni se resta** (decisión explícita del usuario, aunque el Excel lo trae)
- `secuenciaExcel.js`: `parseSecuencia` ahora también devuelve `diario` por mes: `{ 'YYYY-MM-DD': { linea: { turnos, items:[{plataforma,cap,qty}] } } }`. Los turnos salen de las 3 filas que siguen a la etiqueta "TURNOS" del Excel. Nuevo `secuenciaImport.js` (`importarSecuencia(file)`) usado por "Secuencia del mes" y por el Plan semanal; los docs `soldadura_secuencia/{YYYY-MM}` ganan el campo `diario`. **Hay que volver a importar el Excel una vez** (lo ya importado no tiene el detalle por día; la pantalla lo avisa). Lo mensual no cambia
- Nuevo `planSemanalCalc.js` (`calcularPlan`, sin Firestore) y `SoldaduraPlanSemanal.jsx` (ruta `/soldadura/plan-semanal`, chip en el Inicio de Soldadura). Tiempo necesario de un puesto en un día = Σ equipos del modelo × (tiempo estándar × cantidad por equipo × % de la tarea) de lo asignado a ese puesto; disponible = horas × turnos del Excel (si falta, 1 turno con asterisco) × eficiencia. Semáforo: verde ≤90%, naranja ≤100%, rojo si pasa el turno
- Muestra: tabla Puestos × días (+ columna Semana) con % y tiempo; alertas de sobrecarga (puesto, día y modelos que más cargan); al tocar un puesto, la lista de tareas con las unidades de cada día (modelo · tarea); lista de modelos de la semana con su estado (✓ / "Falta armar: …" / "N tarea(s) sin asignar"). Si una tarea de Preformado está dividida entre dos puestos, la cantidad es la misma en ambos y el tiempo se reparte según su % (igual que V310)
- Horas por turno y eficiencia: un valor por línea y semana, editable, guardado en `config/plan_semanal` (clave `linea|lunes`; escribe Ingeniería/Admin, Producción solo lee); si no hay guardado se sugiere el del modelo con más equipos esa semana que tenga puestos armados
- Solo lectura sobre lo existente: no cambia puestos, mediciones ni cálculos de otras pantallas. Verificado con el Excel real (8 meses, semanas lun–sáb) y datos de prueba. Pendiente a futuro: tiempo de cambio de modelo, plan de varias líneas juntas, exportar a PDF

### V310 — Puestos: una tarea dividida entre dos puestos se completa con el mismo número en ambos:
- Pedido con captura del PDF (Válvula 4 Vías): el Preformado PR021 estaba dividido 30% / 70% entre el Puesto 1 y el Puesto 4, pero la columna "Cant. por turno" mostraba 124,2 y 250 (la cantidad del puesto × el %). Como cada pieza pasa por **los dos puestos** (cada uno hace su parte del trabajo), el preformado se completa con el **mismo número en ambos**
- `puestosCalc.js`: nueva `unidadesTarea(porPuesto, code)` → unidades por turno y por día de una tarea = **mínimo** entre los puestos donde está asignada de (unidades del puesto × cantidad por equipo). El % de la división solo reparte el **tiempo** (T. en puesto y "Ocupa del turno" = tStd × % × unidades), no la cantidad. Una tarea no dividida da lo mismo que antes
- Se usa en `exportPuestosPdf.js` (columnas "Cant. por turno" y "Ocupa del turno", más una nota al pie cuando hay tareas divididas) y en el detalle del Paso 4 de `SoldaduraPuestos.jsx` ("N/turno · N/día · ocupa ..."). No cambia ningún dato guardado ni la carga/ritmo de cada puesto

### V309 — Puestos: capacidad por turno de cada puesto en el PDF y en la tarjeta:
- Pedido con captura del PDF de "Distribución de Puestos": que cada puesto muestre la **cantidad que podría hacer en el tiempo estipulado, según el turno en que se trabaja**. Antes el PDF solo mostraba la carga y el % del takt de cada puesto (la capacidad existía en pantalla pero solo en el detalle del Paso 4 y como "solo podría hacer N equipos/turno")
- `exportPuestosPdf.js`: la cabecera de cada puesto ahora lleva una segunda línea "Capacidad en turno de X h: A eq/h · B eq/turno · C eq/día (N turnos)" (`unHs`/`unTurno`/`unDia` de `porPuesto`, ya con la eficiencia aplicada) y la tabla suma dos columnas por tarea: **"Cant. por turno"** (= unidades del puesto por turno × cantidad por equipo × % de la tarea) y **"Ocupa del turno"** (= tiempo estándar × esa cantidad). Mismos cálculos que ya mostraba el Paso 4 (V282/V283), no cambia ninguna fórmula ni dato guardado
- `SoldaduraPuestos.jsx` (tarjeta de cada puesto, Paso 3): el texto pasó de "Este puesto solo podría hacer N equipos/turno" a "Capacidad (turno de X h): A eq/h · B eq/turno · C eq/día"
- Fix menor: el "≈" del PDF no existe en la tipografía y salía como "H"; ahora dice "aprox."

### V308 — Soldadura: mini cronómetro también al cargar cada parte nueva (Preformado y puestos SOL):
- Pedido con captura (Preformado de Válvula 4 Vías): el mini cronómetro de V305 solo estaba en el editor de partes ya guardadas; en el bloque "Preformado por partes" / "Medición por partes" la parte nueva tomaba el tiempo del reloj grande de arriba o de los segundos manuales
- `SoldaduraDetail.jsx`: nueva fila "⏱ Tiempo de esta parte" con `MiniCrono` + campo de segundos (editable a mano) arriba del botón "Guardar como parte". **Prioridad al guardar la parte**: si ese campo tiene segundos se usan esos; si está vacío se sigue usando el reloj grande / los segundos manuales de siempre (compatible con el flujo anterior). Al guardar la parte se limpia el campo y se frena el mini cronómetro (key `parteReset`); si la parte salió del mini cronómetro no se toca el reloj grande
- Estados nuevos: `parteSec`, `parteReset`. No cambia ningún cálculo ni dato guardado

### V307 — Caché de la app (service worker): abre rápido y también con mala señal:
- Pedido: la app se demoraba al abrir (sobre todo después del login) y en planta la señal es mala. Antes de esta versión la app **no tenía service worker** (solo el `manifest.json`). Se eligió empezar por el caché (antes que dividir el bundle de 3 MB con lazy loading, que queda pendiente como V308+ junto con "Tablero por bloques")
- `public/sw.js`: guarda **solo los archivos de la app** (mismo origen). Firebase, Cloudinary y Google **no se tocan** (otro dominio → el service worker no intercepta). La página principal va **primero por red** (llega siempre la versión nueva) y cae a la copia guardada si la red falla o tarda más de 4 s; el resto de los archivos (código con hash, íconos) van primero desde lo guardado. Al instalarse precarga todos los archivos del build; el caché se llama `tubysol-<BUILD>` y al activarse una versión nueva se borran los viejos
- `vite.config.js`: plugin `swBuild()` que al terminar el build reemplaza en `dist/sw.js` los marcadores `'__BUILD__'` (timestamp) y `'__PRECACHE__'` (lista de archivos de `dist/`). Sin ese reemplazo el sw no funciona; en desarrollo no se registra
- `src/registerSW.js` (llamado desde `main.jsx`, solo en producción): registra `./sw.js`, muestra el aviso azul "Hay una versión nueva de TubySol · Actualizar" cuando queda una versión esperando (al tocar: `SKIP_WAITING` + una sola recarga; en la primera instalación no recarga), y busca versión nueva al volver a la app y cada 30 min. Se mantiene aparte el chequeo de `main.jsx` cada 5 min que recarga si cambió el hash del bundle (`getMainSrc` pide `/` con `no-store`; el sw lo trata como página → red primero, por eso sigue funcionando)
- Verificado con Chromium: se registra, guarda los 11 archivos del build, la pantalla de Login abre en modo avión, y al cambiar el BUILD aparece el aviso y al tocarlo se purga el caché viejo
- **Si algo sale mal**: subir una versión que reemplace `public/sw.js` por un worker que se dé de baja (`self.registration.unregister()` + borrar los `caches` que empiecen con `tubysol-`), o desde el navegador borrar los datos del sitio. Los datos (Firestore) no se cachean en el sw (Firestore ya tiene su propia caché local)

### V306 — Soldadura: agregar partes a una medición ya guardada sin partes:
- Pedido con captura (SOL-04): una medición guardada normalmente (ej: 2:07:00 con 4 subc.) tiene que poder ampliarse después con otras piezas, sin haberla guardado "como parte" desde el principio
- `SoldaduraDetail.jsx`: cada medición guardada **sin partes** muestra el enlace "🧩 Agregar partes a esta medición" (en todos los puestos). Abre el mismo editor de partes con la medición actual convertida en la **primera parte** (tipo = nombre del subconjunto, cantidad = sus subconjuntos, segundos = su tiempo observado) más una fila vacía para la nueva pieza; se puede usar el mini cronómetro ⏱ de cada fila. Al guardar se aplica la misma lógica de V289: tiempo = Σ (obs ÷ cant) de cada parte, `subconjuntosQty = 1`, `partes` dentro; también se actualiza en los otros modelos que comparten el subconjunto
- Las mediciones normales siguen guardándose igual (botón "Guardar y continuar"); nada cambia para las que no se amplían

### V305 — Soldadura: medición por partes en todos los puestos SOL + mini cronómetro al editar partes:
- Pedido: a veces en un puesto se suelda otra pieza aparte (de un tipo de SC) y hay que medir un tramo, después otro, y quedarse con una sola medición. Confirmado con el usuario: se mide **por partes como Preformado** (opción 1 acordada). Además, al editar las partes de una medición los segundos solo se podían tipear: se pidió un mini cronómetro
- `SoldaduraDetail.jsx`: el bloque "🧩 Medición por partes" (antes solo en Preformado) ahora está en **todos los puestos**. En Preformado sigue igual y siempre visible; en SOL-01…SOL-18 aparece como botón "🧩 Medir por partes" que despliega el bloque (queda abierto solo si ya hay partes pendientes). Mismo flujo: elegir tipo + cantidad, cronometrar con el reloj de arriba, "Guardar como parte", y "Completar medición (sumar partes)" guarda UNA medición (tiempo = Σ obs÷cant de cada tipo, `subconjuntosQty = 1`, `partes` dentro) — Balance/Puestos/Tiempos siguen leyendo `tiempoObs`/`tiempoNorm` como siempre
- Tipos: Preformado sigue con `config/preformado_tipos.tipos`; los puestos SOL usan una lista aparte `tiposSold` **en el mismo documento** (se guarda con `merge`, así no hace falta tocar `firestore.rules`: lo escribe `esPlanta`). Etiquetas "Tipo de pieza" / "Subconjunto completo" en los puestos SOL
- **Mini cronómetro** (`MiniCrono`, botón ⏱/⏹) en cada fila del editor "✏️ Editar partes": arranca desde los segundos ya escritos, los va cargando en el campo mientras corre y se puede corregir a mano. Aplica también a las partes nuevas de "+ Agregar parte"
- Las partes pendientes siguen en `localStorage` por modelo+subconjunto+puesto (clave `tubysol_partes_preformado`)

### V304 — Nuevo "📊 Tablero" (cuadro de mando integral con KPIs) en el menú:
- Pedido: un apartado de KPIs / control de mando, armado con lo que ya está cargado. Se mostró antes una maqueta en el chat (datos inventados) y el usuario pidió avanzar para "ir viendo cómo queda". Es **solo lectura**: no cambia ningún dato ni cálculo de otras pantallas; lo único que se guarda son las **metas** (`config/tablero_metas`, escriben Ingeniería/Admin — la regla `config/{docId}` ya lo permite, sin tocar `firestore.rules`)
- Nuevo `pages/tablero/tableroCalc.js` (`calcularTablero()`, todo el cálculo, sin Firestore) y `pages/tablero/Tablero.jsx` (pantalla, ruta `/tablero`, tile en el Inicio). Visible para **Admin e Ingeniería** (todo) y para el perfil **solo Calidad** (únicamente Calidad + Avisos). Producción y Externo no lo ven (decisión abierta: se puede habilitar)
- Perspectivas: 🏭 Procesos (Soldadura medida, Tiempos confiables = tareas con 2+ mediciones, Líneas con takt cargado, Líneas armadas que llegan al takt [cuello de botella de `soldadura_puestos` vs Takt Time], Tuberías medidas [planos PP vigentes con medición], Ritmo de mediciones 7 días vs 7 anteriores + gráfico de 14 días), 📅 Planificación (% de los equipos del último mes de `soldadura_secuencia` cuyo modelo tiene tiempos medidos, equipos del mes, qué falta medir), ✅ Calidad (30 días: % OK Auditoría de Tubería con NOOK por máquina/control, % OK Check List Soldadura y NOK por categoría, % de NOK con foto, % OK Producto Terminado), 📢 Mejora continua (días promedio de cierre de avisos, avisos pendientes con +7 días, pendientes por prioridad)
- Arriba: barra de estado general (cuántos indicadores en meta) y "🚨 Atención hoy" con lo urgente; cada tarjeta/fila lleva a la pantalla correspondiente. Semáforo: verde cumple la meta, naranja hasta 15% por debajo (en los de "menos es mejor", algo por encima), rojo más lejos, gris sin datos
- Metas por defecto en `METAS_DEFAULT` (ej: cobertura soldadura 90%, calidad 97%, cierre de avisos ≤3 días), editables con "⚙️ Metas" ("Valores sugeridos" las restablece)
- Costos de lectura: escucha en vivo `soldadura_tiempos`, `tuberia_tiempos`, calidad y avisos (como otras pantallas) y lee `tuberia_bd` (solo piezas PP) **una vez por sesión**. Las mediciones compartidas entre modelos (V286) se cuentan una sola vez en la actividad
- Pendiente a futuro: plan contra real (requiere cargar la producción diaria), productividad por operario, más indicadores según los apuntes de la universidad del usuario

### V303 — Seguridad: guía de "Contraseña olvidada" en Gestión de Usuarios:
- Decisión con el usuario (2 personas, ambas Administrador): recuperación **asistida por un Administrador**, sin servidor ni correo real (las cuentas usan correos internos `nombre.perfil@tubysol.app`, que no reciben mails). Quedaron descartadas por ahora: correo real de recuperación y un Worker con cuenta de servicio para restablecer desde la app (ver opciones 2 y 3 si el equipo crece)
- `GestionUsuarios.jsx`: botón **🔑** en cada perfil con cuenta segura → modal "Contraseña olvidada" con el **Paso 1** (copiar el correo interno de esa cuenta y abrir Firebase → Authentication → Usuarios para eliminarla) y el **Paso 2** (elegir la contraseña nueva, 6+ caracteres, y "Crear contraseña nueva": crea la cuenta nueva, borra el registro de rol viejo, escribe el nuevo `tubysol_roles/{uid}` conservando habilitado/subrol y actualiza el `uid` del perfil). Si la cuenta vieja todavía existe avisa que hay que eliminarla primero. Los datos de la persona no se tocan
- `Login.jsx`: texto "¿Olvidaste tu contraseña? Pedísela a Administración." `Instrucciones.jsx` (panel Admin): documentado el proceso y actualizadas las filas de Crear/Editar usuario (ya no hay contraseñas visibles). Conviene mantener siempre 2 Administradores para poder ayudarse entre sí

### V302 — Seguridad, etapa C: se saca el acceso anterior (y la contraseña maestra) + reglas de Firestore por perfil:
- Los dos usuarios ya pasaron a cuenta segura (Firebase Authentication mostraba sus 2 cuentas: `michael-trujillo.admin…` y `derlis-martinez.admin…`, ambas Administrador). Esta versión **elimina del código la contraseña maestra** y todo el login anterior: `AuthContext.login()` solo entra con la cuenta de Firebase (nombre + perfil + contraseña) y el rol sale de `tubysol_roles/{uid}`; al recargar se valida la sesión real de Firebase (el usuario guardado en la pestaña solo evita el parpadeo y se pisa con el rol real). El nombre ahora es obligatorio también para Administrador. Se saca `crearAdminInicial` y la pantalla "Tu cuenta de Administrador"
- Nuevo `firestore.rules` (en la raíz; **no se publica solo**: hay que pegarlo en Firebase → Firestore → Reglas → Publicar). Sin registro de rol activo no se lee ni escribe nada. Admin: todo. Ingeniería: escribe modelos/puestos/secuencia/config técnica; Producción: mediciones (soldadura/tuberías) y operarios; Calidad: formularios de calidad; Externo: solo lectura + fotos de piezas de tuberías; Avisos: cualquier perfil activo; `tubysol_usuarios`, `tubysol_roles`, `tubysol_solicitudes` (salvo crear) y visualizadores/logo/perfiles suspendidos: solo Admin. El pedido de acceso lo puede crear cualquiera pero sin contraseña y con campos fijos; `config/roles_suspendidos` se lee sin login (lo usa la pantalla de Login)
- `GestionUsuarios.jsx`: ya no muestra contraseñas; nuevo aviso con botón "🧹 Borrar contraseñas viejas" si quedan en texto plano; un perfil sin cuenta segura se marca para eliminarlo y volver a agregarlo
- Si las reglas nuevas rompen algo: Firebase → Firestore → Reglas → versión anterior → restablecer. Pendiente opcional: App Check, limitar la clave de API al dominio

### V301 — Seguridad, etapa B (pase): login con cuentas seguras de Firebase Authentication (con respaldo del acceso anterior):
- Plan acordado con el usuario (solo 2 personas usan la app; el Worker de Cloudflare `basededatos` es de archivos estáticos y se actualiza subiendo el zip, así que NO se usa un Worker con código ni cuenta de servicio): cada perfil de cada persona = una cuenta de Firebase Authentication con correo interno `nombre-slug.perfil@tubysol.app` (no se muestra); la contraseña la guarda Firebase cifrada. El rol de cada cuenta vive en `tubysol_roles/{uid}` = `{nombre, roleKey, habilitado, subrol}` (lo que usarán las reglas de Firestore; solo Admin lo podrá escribir)
- `firebase.js`: exporta `auth` (sesión por pestaña, como antes) y `authListo`. Nuevo `utils/cuentas.js`: `emailDe()`, `crearCuenta()`/`uidDeCuenta()` (usan una 2ª instancia de Firebase para no cerrar la sesión de quien crea), `escribirRol()`
- `AuthContext.login()` ahora devuelve `'ok' | 'error' | 'admin-setup' | 'sin-permiso'`. Orden: (1) entra con la cuenta segura; (2) **acceso maestro anterior** → `admin-setup`: pide nombre + contraseña nueva y crea la cuenta propia del Administrador (`crearAdminInicial`); (3) **perfil del sistema anterior** (`tubysol_usuarios`): si la contraseña es correcta crea su cuenta segura con esa misma contraseña, escribe su rol y **borra la contraseña en texto plano** (`perfiles.<rol>.password`). Si algo falla en el pase (sin conexión, Firebase Authentication sin activar, contraseña de menos de 6 caracteres) entra como antes para no dejar a nadie afuera. Nuevo `cambiarClave()` y botón "🔑 Cambiar" en el Inicio
- `Login.jsx`: pantalla "Tu cuenta de Administrador" (primer ingreso con la maestra); "Solicitar acceso" ahora crea la cuenta (sin permisos hasta que Admin la apruebe), exige 6+ caracteres y la solicitud guarda solo el `uid`, nunca la contraseña
- `GestionUsuarios.jsx`: ya no muestra contraseñas de cuentas pasadas ("🔒 Cuenta segura"); Aprobar/Agregar perfil crean la cuenta y su rol; Activo/Inactivo, subrol y eliminar se sincronizan con `tubysol_roles`
- **Las reglas de Firestore siguen abiertas en esta versión.** Pendiente: etapa C (cuando los 2 usuarios ya hayan entrado una vez): versión sin el acceso anterior (ni contraseña maestra) + reglas por rol. Recuperar una contraseña olvidada: borrar la cuenta en Firebase → Authentication → Usuarios y volver a agregar el perfil. Requiere que esté activado "Correo electrónico/contraseña" en Authentication → Método de acceso

### V300 — Seguridad, etapa A: botón "💾 Respaldo" (Admin) con copia completa de la base:
- Contexto: se confirmó con captura de la consola que las reglas de Firestore del proyecto `bd-tuberias` están en `allow read, write: if true` (cualquiera con la URL puede leer/modificar/borrar), y el plan de Firebase es Spark (gratis). Hasta cerrar las reglas, un borrado accidental o malintencionado no tiene vuelta atrás, así que primero se agrega una copia de seguridad
- Nuevo `utils/respaldo.js` + botón "💾 Respaldo" en el Inicio (solo Admin): lee todas las colecciones de la app (soldadura_*, tuberia_*, calidad_*, avisos, config, tubysol_operarios/usuarios/solicitudes) y descarga un `Respaldo_TubySol_AAAA-MM-DD.json`. **Las contraseñas de usuarios y solicitudes no se incluyen** (quedan como "***"), para que el archivo no sea un riesgo. Es solo lectura: no modifica nada
- El archivo sirve para recuperar datos por si algo se borra (restaurar sería un script aparte, no está hecho). Pendiente (etapas B y C): login verificado por el Worker de Cloudflare con token personalizado de Firebase, contraseñas con hash, y reglas de Firestore por perfil; requiere saber cómo se despliega el Worker y crear una cuenta de servicio en Firebase

### V299 — Soldadura Puestos: "Secuencia del mes" (mezcla real de modelos desde el Excel de Secuencia de producción):
- Pedido: el Excel de planificación ("Secuencia Midea Carrier", hoja única `Secuencia(P)`) dice qué modelos, capacidades y cantidades entran cada mes; el interés es siempre el **último mes cargado** (octubre). Aclarado con el usuario: del Excel solo importan modelo, capacidad, línea y cantidades por día; **no** se usan Balanceo (gente de la línea de armado), T STD (tiempo teórico desde Buenos Aires) ni la dotación del Excel (la dotación de soldadura se sigue calculando con la recomendación y la configuración de la app); "Paso" es la velocidad de la línea (equivale al Takt, pero se usa el Takt Time cargado). La marca (Midea/Surrey/Comfee/Carrier) no cambia los caños: se suma por plataforma+capacidad y se muestra solo como detalle
- Nuevo `secuenciaExcel.js`: `parseSecuencia()` lee la hoja (fila de encabezado LINEA/Modelo y las columnas de fechas), suma la **grilla diaria** por línea (IDU / ODU I / ODU II) + plataforma + capacidad + mes (no el Qty del lote, porque un lote puede cruzar de mes) y cuenta los días con producción de cada línea. `claveModelo()` compara nombres sin importar mayúsculas ni orden de palabras ("AG FIJO R32" = "Fijo AG R32")
- Nueva colección Firestore `soldadura_secuencia/{YYYY-MM}`: `{items:[{linea,plataforma,cap,qty,marcas}], dias:{…}, archivo, importadoEn}`. Importar de nuevo reemplaza los meses que trae el archivo (no toca los otros). Mapeo de líneas: IDU→IDU, ODU I→ODU, ODU II→ODU2 (los modelos WRAC/Portable de ODU II son los de la línea ODU2 de soldadura)
- Nuevo `SecuenciaMes.jsx`, tarjeta desplegable entre el paso 1 y el 2 de Puestos: selector de mes (arranca en el último), de línea del plan, botón "📥 Importar secuencia (Excel)" (oculto para Producción). Muestra equipos del mes, equipos por día/semana, **takt del mes** (tiempo útil por día ÷ equipos por día, con las horas/turnos/eficiencia del paso 1), **personas con la mezcla** (trabajo promedio ponderado por la mezcla ÷ takt del mes, mínimo teórico) y una tabla por modelo: equipos, % de mezcla, trabajo por equipo, **takt cargado de ese modelo** y personas solo para ese modelo. Avisa qué % de los equipos tiene tiempos medidos (los sin medir se estiman con el promedio), compara lo que produciría el armado actual del modelo contra lo que pide el plan, y el botón "Usar como meta" pasa los equipos del modelo y los días del mes al paso 1
- Refactor interno sin cambios de comportamiento: `buildTareas`, `statsNorm`, `parseTakt`, `fmtNum`, `fmtDuracionSeg` pasaron de `SoldaduraPuestos.jsx` a `puestosCalc.js` para compartirlos
- Pendiente: probar con datos reales (la mayoría de los modelos del plan puede no tener tiempos medidos todavía)

### V298 — Fix: importar Excel de Soldadura ya no pierde un subconjunto sin fila "Completo":
- Reportado con el Excel V4: se agregó PR040 ("Pref. Válvula Líquido", Válvula Líquido) para Inverter EZ R32 y GP R32 12FC, pero no aparecía en la app. Causa: ambas filas de PR040 estaban con Tipo = "Parcial" (SC184 y PR040/PR040), y la app arma cada subconjunto desde la fila "Completo" y cuelga los Parciales debajo — sin fila Completo, el grupo quedaba huérfano e invisible. Comparar con PR034 (Válvula 4 Vías), que sí tiene su fila PR034/PR034 como Completo
- `SoldaduraHome.jsx` → importación: nuevo paso que, si un código de Completo no tiene ninguna fila Completo, toma la fila Parcial cuyo código parcial = completo (ej: PR040/PR040) como el Completo del grupo; los demás Parciales (SC184) quedan colgados de él. Si el Excel ya tiene su fila Completo, no cambia nada. Para que aparezca hay que volver a importar el Excel

### V297 — Puestos: opciones de personas centradas en el número indicativo (±2):
- Pedido con captura: el paso 2 mostraba siempre desde (mínimo teórico − 1) hasta (+3), p. ej. 3 a 7, sin importar cuál era la cantidad real recomendada
- `SoldaduraPuestos.jsx`: ahora se evalúan todas las opciones desde 1 persona y el **número indicativo** es la primera que llega al takt (RECOMENDADO); se muestran **2 menos y 2 más** alrededor de ese número (ej: recomendado 4 → 2, 3, 4, 5, 6). Si ninguna llega al takt, se centra en el mínimo teórico y muestra hasta +4. Los cálculos de cada opción no cambian

### V296 — Fix: Puestos no mostraba el Takt Time cargado si la línea no tenía tareas medidas:
- Reportado con capturas: Inverter EZ R32 12FC IDU tiene Takt 00:38:00 en Takt Time, pero Puestos mostraba "Takt de la línea —  sin takt ni meta". Causa: el cálculo de dotación (`dot`) devolvía `null` cuando no había tareas con tiempo medido (esa línea tenía 0), y el indicador del takt dependía de `dot`
- `SoldaduraPuestos.jsx`: nuevo `taktMostrarSeg` (takt cargado aunque no haya tareas); el indicador y las barras usan ese valor, y el paso 2 explica que el takt está cargado pero faltan tareas medidas. Con tareas medidas todo se calcula igual que en V295

### V295 — Soldadura Puestos: botón "📄 Exportar PDF para imprimir":
- Pedido: poder imprimir la distribución de puestos. Nuevo botón arriba del tablero de Puestos (visible para todos los perfiles, es solo lectura)
- Nuevo `exportPuestosPdf.js` (jsPDF + autoTable, A4 vertical): encabezado con Modelo·Cap·Línea y fecha, tabla resumen (takt y su origen, trabajo por equipo, personas necesarias/armadas, meta, turnos, cuello de botella, ritmo, días para la meta), una tabla por puesto (código, subconjunto con % si está dividido, cantidad, tiempo estándar, tiempo en el puesto; cabecera con carga y % del takt, roja si es cuello de botella o pasa el takt) y las tareas sin asignar. Numera páginas; archivo `Puestos_Modelo_Cap_Línea.pdf`
- No cambia ningún cálculo ni dato guardado

### V294 — Fix: Puestos usa el Takt Time cargado de la línea (no solo el deducido de la meta):
- Reportado con capturas: Portable R32 12FC ODU2 tiene cargado un Takt de **01:30:00** (1:30 min) en la pantalla Takt Time, pero Puestos mostraba "Takt requerido 9:36 min" — ese valor no se leía de Takt Time, se calculaba como tiempo disponible ÷ meta (8,08 h × 1 turno × 22 días × 90% ÷ 1000 equipos = 9:36). Era otro concepto con el mismo nombre, y subestimaba la gente necesaria
- `SoldaduraPuestos.jsx`: nuevo listener a `config/takt_soldadura` y `parseTakt()` (mismo de Balance). Clave `docId||línea`, cae a la vieja `docId`. **Si hay Takt cargado, manda**: dotación, escenarios, barras de los puestos (línea negra) y avisos se calculan contra ese takt. Si no hay, se usa el deducido de la meta como antes
- El indicador pasó a llamarse "Takt de la línea" y dice de dónde sale ("cargado en Takt Time" / "calculado con la meta"); el texto del paso 2 lo explica y, con Takt cargado, aclara aparte cuánto haría falta solo para la meta
- Con Takt cargado ya no hace falta la meta para calcular la dotación; "Meta en: N días" y el aviso del tope solo aparecen si hay meta

### V293 — Soldadura Puestos: rediseño visual en 4 pasos, más intuitivo para trabajar:
- Pedido con capturas tras probar V292: "está bien como está presentado, pero visualmente lo encuentro poco intuitivo como trabajarlo y modificarlo". **Solo cambia la presentación — los cálculos y los datos guardados son los mismos de V292**
- Arriba, tablero de 5 indicadores: Takt requerido, Personas necesarias, Personas armadas (roja si faltan), Días para la meta con el armado actual (verde/roja vs. el plazo) y Tareas sin asignar
- Pantalla ordenada en pasos numerados: **1 Datos de producción** (colapsable, muestra un resumen en una línea cuando está cerrado; arranca abierto solo si falta la meta), **2 ¿Cuánta gente necesito?** (texto explicativo del takt y del mínimo, y escenarios como tarjetas con "RECOMENDADO"/"no llega"/"supera tope" y botón "Armar con N personas"), **3 Puestos y tareas** (tablero), **4 Resultado con este armado** (ritmo de la línea, días para la meta en verde/rojo y el detalle por puesto desplegable)
- Paso 3 como tablero: bandeja "📥 Tareas sin asignar" con fichas naranjas, y una tarjeta por puesto con su barra de carga (verde con margen / naranja >90% / roja si pasa el takt, con una **línea negra que marca el takt**), "% del takt", y sus tareas como fichas azules. Tocar cualquier ficha abre una hoja con botones de puesto (incluye "Sin asignar"), cantidad por equipo (×1…×10) y, si es Preformado, dividir 50/50 o con % entre 2 puestos. Eliminar un puesto con tareas pide confirmación
- Nuevos componentes en `SoldaduraPuestos.jsx`: `StepNum`, `TareaChip`, `LoadBar`. Se sacó `BarChart` (los gráficos de barras de V282 quedaron reemplazados por las barras de cada tarjeta) y los selects por tarea del listado viejo

### V292 — Soldadura Puestos: dotación necesaria, reparto sugerido y división de Preformado:
- Pedido: que la pantalla de Puestos ayude a saber **cuánta gente hace falta** para cumplir una meta, con las tareas repartidas entre esa cantidad de personas. Respuestas acordadas: solo las tareas de **Preformado** se pueden dividir, y en **2 puestos como máximo**; la precedencia preformado→soldar se ignora por ahora; los subconjuntos de **IDU solo se sueldan en los primeros 5 puestos**; se trabaja **un modelo a la vez** (después se evaluará todos los modelos); la meta es una cantidad de equipos para un **plazo** (secuencia mensual)
- Nuevos parámetros (guardados en `soldadura_puestos/{docId||linea}`): `diasPlazo` (días para cumplir la meta, default 20), `maxPuestos` (tope de puestos de la línea, 0 = sin tope; **default 5 para la línea IDU**), `cantidades` ({código: unidades del subconjunto por equipo terminado, default 1, selector ×N en cada tarea})
- Nuevo panel "🧮 Dotación necesaria": takt requerido (= horas × turnos × días × eficiencia ÷ meta), trabajo total por equipo, mínimo teórico de personas, personas reales con el reparto sugerido, y tabla de escenarios (N−1 … N+3) con cuello de botella, un/turno, días para la meta, % de balance y minutos-hombre por equipo. Botón "Armar" por escenario crea los puestos y reparte las tareas (pide confirmación si ya había puestos; después se edita a mano). Avisa si se supera el tope de puestos (IDU) y qué tareas son más largas que el takt
- `distribuir(items, N)` en `SoldaduraPuestos.jsx`: reparto de tareas enteras de mayor a menor al puesto menos cargado + mejora por mover/intercambiar desde el cuello de botella + división en 2 puestos (pasos de 5%) de la tarea de Preformado que más ayude
- División manual: las tareas cuyo puesto de medición de origen es Preformado (`origen` en `buildTareas`) muestran "✂️ Dividir entre 2 puestos" con % para el primero. En `asignaciones` una tarea dividida son 2 entradas con `pct` (sin `pct` = 100%, compatible con lo guardado antes). La carga del puesto = Σ tiempo estándar × cantidad por equipo × % de la tarea
- Otros: % de ocupación por puesto (vs. el cuello de botella) y avisos de subconjuntos sin tiempo medido y tareas con una sola medición. No se tocó Balance ni los datos existentes; con cantidad ×1 y sin divisiones los números son idénticos a V283
- Pendiente (a futuro): mezcla de varios modelos de la secuencia mensual; restricción ODU en puestos 6+; precedencias

### V291 — Fix: Resumen de Soldadura conserva el filtro (día/puesto/búsqueda) al volver desde un subconjunto:
- Reportado con captura: con un día elegido en el Resumen, entrar a un subconjunto medido y volver atrás dejaba el Resumen sin filtro
- `SoldaduraTiempos.jsx`: al abrir un subconjunto manda en el `state` de navegación el filtro actual (`selectedDate`, semana visible, `puestoFilter`, `search`) junto con el `from`; al montarse lo lee de `location.state.filtro` y lo restaura. Entrando de cero al Resumen el filtro arranca vacío como siempre
- `SoldaduraDetail.jsx`: el botón ← del `Header` devuelve ese mismo filtro (`backState`). Mismo patrón que V269 (Cobertura de Tuberías)

### V290 — Soldadura: exportar a PDF el Ciclo y el Takt Time por modelo, con sus subconjuntos:
- Pedido: un botón en Soldadura que exporte en PDF el ciclo y el takt time de los modelos, con los subconjuntos que los componen y su tiempo de demora (promedio total del subconjunto)
- Nuevo chip "📄 PDF Ciclo/Takt" en el Inicio de Soldadura (oculto para Producción, mismo criterio que Takt Time). Abre un selector de Modelo ("Todos los modelos" o uno puntual) y genera el PDF
- Nuevo `exportCicloTakt.js` (lee `soldadura_modelos`, `soldadura_tiempos`, `config/ciclos_soldadura`, `config/takt_soldadura` al momento de exportar). Por cada modelo+capacidad: encabezado con el **Takt de cada línea** (clave `docId||línea`, cae al `docId` legado) y una tabla con Línea, Código, Descripción, Tipo (Completo/Parcial), **Ciclo** guardado, **T. Normal promedio**, cantidad de mediciones y puestos medidos
- "Tiempo de demora" = promedio de **todas** las mediciones del subconjunto en cualquier puesto, tiempo normal por unidad (`tiempoNorm ÷ subconjuntosQty`) — a diferencia de Balance, que toma el puesto donde más se midió. Sin mediciones se muestra "—". Respeta el `storageKey` con `||P` para Parciales que comparten código con su Completo

### V289 — Preformado por partes: tipo + cantidad por parte, y edición posguardado:
- Pedido tras probar V288: las partes ignoraban la cantidad de cada tramo (ej: 30 s para 5 precintos y 40 s para 6 damping eran un bloque de 70 s). Lógica acordada: **cada parte = un tipo de trabajo con su cantidad**; tiempo por unidad = observado ÷ cantidad (30/5 = 6 s por precinto, 40/6 = 6,67 s por damping), y **un preformado completo lleva una unidad de cada tipo** → tiempo de la pieza = suma de los tiempos por unidad
- Cada parte ahora es `{ tipo, cant, obs }` (obs en cs). Al completar: `tiempoObs` = Σ round(obs/cant), `tiempoNorm` = tiempoObs × valoración, y **`subconjuntosQty = 1`** — así Balance/Tiempos/Puestos siguen leyendo el tiempo normal de la pieza completa sin cambios. En este modo el campo "Subc." de arriba no se usa
- Tipos de preformado: lista editable y compartida (`config/preformado_tipos`, `{tipos:[…]}`), con "+ Nuevo" en el panel (cualquier perfil) y "Editar lista de tipos" para quitarlos (no Producción). Quitar un tipo no modifica mediciones ya guardadas
- Posguardado: en "Mediciones guardadas", el bloque 🧩 Desglose muestra tipo, × cantidad, Obs y Norm por unidad de cada parte, y el total del preformado completo. Botón "✏️ Editar partes": cambiar tipo/cantidad/segundos, quitar partes y **agregar otra parte**; al guardar se recalculan totales. La edición también se aplica a las copias en otros modelos con el mismo subconjunto (se ubican por fecha + operario)
- Compatibilidad: las partes de V287/V288 eran un número suelto; se leen con la cantidad de subconjuntos de esa medición (`normParte`), y al editarlas pasan al formato nuevo manteniendo el mismo tiempo normal por unidad

### V288 — Preformado por partes: desglose de tiempo dentro de la medición:
- Pedido tras probar V287 (con 9 subconjuntos y partes de 3:57 + 1:50): que la medición guardada muestre el tiempo normal (observado ÷ cantidad de subconjuntos) y el comentario si se agregó, con las partes como un desglose dentro del tiempo total
- `SoldaduraDetail.jsx`: al completar el preformado ya no se escribe "Suma de N partes…" dentro del comentario — la nota queda solo con lo que escribe el usuario. Las partes siguen viajando en `medicion.partes` (cs)
- En "Mediciones guardadas", cada medición con partes muestra un bloque "🧩 Desglose": cada parte con su Obs y su Norm (parte × valoración ÷ subconjuntos) y una línea Total con Obs y Norm de la medición. La medición sigue teniendo su Obs/Norm arriba y su nota debajo
- Las mediciones de V287 ya guardadas conservan el texto "Suma de…" en su nota (no se migran), pero también muestran el bloque de desglose. No cambia ningún cálculo: Balance, Tiempos y Puestos siguen leyendo `tiempoObs`/`tiempoNorm`/`subconjuntosQty` como antes
- La suma de los Norm por parte puede diferir en 1 centésima del Norm total por redondeo

### V287 — Soldadura: Preformado por partes (suma de tramos en una sola medición):
- Pedido con capturas (ej: Válvula 4 Vías): el preformado de una pieza con varios subcomponentes a veces se hace por tramos y no de una sola vez — hacía falta medir cada tramo por separado y después sumarlos en un preformado completo
- `SoldaduraDetail.jsx`: **solo en el puesto Preformado**, nuevo bloque "🧩 Preformado por partes" arriba del botón Guardar. "➕ Guardar como parte" toma el tiempo actual (cronómetro o segundos manuales), lo agrega a la lista de partes y reinicia el cronómetro para la siguiente. Cada parte se puede quitar (✕); se muestra el total acumulado
- "✅ Completar preformado (sumar partes)" guarda **una sola medición** con tiempo = suma de las partes (mismo operario/valoración/cantidad del formulario), con la nota "Suma de N partes: a + b + c" y el campo `partes` (array en cs) dentro de la medición. Esa medición se propaga a otros modelos con el mismo subconjunto como cualquier otra (V286). Las partes sueltas nunca cuentan como mediciones ni entran en promedios/Balance
- Las partes pendientes se guardan en `localStorage` (clave `tubysol_partes_preformado`, por modelo+subconjunto+puesto) para no perderse si se recarga la pantalla; es por dispositivo, no se comparten entre celulares
- El botón normal "Guardar y continuar" sigue igual para preformados hechos de un tirón. `guardarYContinuar(storageKey, partesCs)` recibe opcionalmente las partes; sin ellas se comporta exactamente como antes

### V286 — Soldadura: los subconjuntos con el mismo código comparten tiempos entre modelos:
- Reportado con caso real: SC187 ("Entrada Distribuidor Bronce") medido en SOL-02 para el modelo "Inverter EZ R32" 18FC no se reflejaba en el mismo SC187 del modelo "Inverter GP R32" 18FC, a pesar de ser el mismo subconjunto compartido entre ambos modelos — "la simultaneidad de SC deben compartir los tiempos como lo hablamos siempre"
- `SoldaduraDetail.jsx`: cada vez que se guarda una medición nueva, además de guardarla en el propio modelo, se propaga automáticamente a todos los demás modelos que tengan un subconjunto (Completo o Parcial) con exactamente el mismo código — mismo criterio que ya usa Tuberías para SP/AD/PP, adaptado acá con la función `storageKeyEnModelo()` para respetar el sufijo `||P` que ya existía (V238) cuando un Completo y su propio Parcial comparten código dentro del mismo modelo
- `SoldaduraHome.jsx`: nuevo botón de Admin "🔁 Sincronizar tiempos" — hace el backfill de una sola vez para lo que ya estaba cargado ANTES de este fix (como el caso real de SC187), juntando y deduplicando las mediciones de todos los modelos que comparten un código y parejándoselas a todos. No borra nada, solo agrega lo que a cada modelo le falte
- El match es por código exacto y mismo tipo (Completo con Completo, Parcial con Parcial) — no cruza un Completo con un Parcial de otro código aunque coincida el texto

### V285 — Suspender un perfil del sistema entero (ej: Calidad) para sacarlo de los desplegables:
- Corrección de rumbo tras V284: el pedido no era sobre perfiles puntuales dentro de un usuario, sino sobre el **tipo de perfil completo** — ej: "el perfil de Calidad ya no se utiliza, lo deseo suspender para dejar de verlo en la lista desplegable" (la del Login)
- Nueva sección "🎚️ Perfiles del sistema" en Gestión de Usuarios (Admin): un toggle Activo/Suspendido por cada perfil (Ingeniería/Producción/Externo/Calidad — Administrador no es suspendible, para no poder dejar a todo el mundo afuera de la app por error), guardado en `config/roles_suspendidos`
- Un perfil suspendido desaparece de los 3 desplegables donde se elige un perfil para asignarlo: el selector "Área / Rol" del Login, el selector de "Solicitar acceso", y el "+ Agregar perfil" de Gestión de Usuarios — **sin afectar a nadie que ya lo tenga asignado**, esa persona sigue entrando normalmente (el filtro es solo sobre las listas de selección, no sobre el login en sí)
- `AuthContext.jsx` ahora expone `USERS` ya filtrado (antes era una constante fija) y `rolesSuspendidos`/`NOMBRE_TO_KEY` para que Login y Gestión de Usuarios apliquen el mismo filtro sin duplicar la fuente de la verdad
- No se tocó el toggle Activo/Inactivo por usuario de V284 — son dos cosas distintas y se mantienen las dos: una decide qué perfiles existen como opción en todo el sistema, la otra qué usuario puntual tiene ese perfil habilitado

### V284 — Gestión de Usuarios: los perfiles inactivos se colapsan, no ensucian más la vista:
- Pedido: "hay perfiles que no se usan y es engorroso visualmente que estén" — refiriéndose a los perfiles por rol (Calidad, Ingeniería, etc.) dentro de un usuario. Ya existía el botón Activo/Inactivo (V261 y anteriores), pero marcarlo Inactivo no lo sacaba de la vista, solo le cambiaba el color — seguía ocupando el mismo lugar en la lista
- `GestionUsuarios.jsx`: dentro de cada usuario, los perfiles se separan en Activos (siempre visibles) e Inactivos (colapsados detrás de "Ver perfiles inactivos (N)", mismo patrón ya usado para "solicitudes resueltas"). Nada se borra ni se pierde — un perfil inactivo se puede reactivar en un toque igual que antes, solo que ya no aparece por default
- No se tocó el criterio de qué perfil cuenta como inactivo (`habilitado === false`, ya existente) ni el propio botón de activar/desactivar — es puramente de presentación

### V283 — Soldadura Puestos: tiempo dedicado a cada tarea dentro del turno:
- Pedido tras probar V282: la cantidad por tarea rinde igual para todas las de un mismo puesto (correcto, es la cascada), pero eso no dice cuánto tarda cada una en construirse — el usuario dio el ejemplo de dos subconjuntos de 2s y 3s: aunque terminen en la misma cantidad, insumen tiempos distintos del turno
- Cada tarea del desglose por puesto ahora muestra su propio tiempo estándar ("(0:02 c/u)") y una segunda línea con **cuánto tiempo del turno ocupa completar esa tarea puntual** (tiempo estándar × cantidad por turno) — se ve que las tareas más largas se "comen" más turno que las cortas, aunque la cantidad de unidades dé la misma
- No cambia ningún cálculo existente — es información adicional derivada de los mismos datos (Un/turno y tiempo estándar) que ya se mostraban desde V281

### V282 — Soldadura Puestos: gráficos de barras + desglose de ritmo por tarea:
- Pedido de ajuste tras probar V281: (1) un gráfico para visualizar mejor, calcado a los dos que tenía el Excel de referencia; (2) dejar claro cuántas unidades salen por tarea cuando un puesto tiene más de una asignada — el usuario dio el ejemplo puntual "puesto de 20s + 2 tareas de 5s = 2 unidades de A y 2 de B" para confirmar el criterio
- Nuevos gráficos de barras (componente `BarChart` reutilizable, mismo estilo visual que las barras de carga que ya usa Balance): "Carga (TC) por puesto" dentro de Resultado por puesto (resalta el cuello de botella en rojo), y "Tiempo estándar por tarea" dentro de Tareas a soldar (las tareas sin asignar quedan en naranja)
- Aclarado que cuando un puesto tiene más de una tarea asignada, **cada tarea rinde el mismo ritmo que el puesto entero** (Un/hs, Un/turno, Un/día), no se reparte entre ellas — el puesto arma una unidad de cada tarea por ciclo, como una cascada. La fórmula ya daba esto bien desde V281 (verificado con el ejemplo del usuario), lo que faltaba era mostrarlo: ahora cada tarjeta de puesto lista el ritmo de cada tarea asignada por separado, con una aclaración cuando hay más de una
- Es puramente un ajuste visual/de presentación — no cambia ningún cálculo de V281

### V281 — Soldadura: nueva pantalla "Distribución de Puestos" (asignación manual de tareas + cálculo de meta):
- Pedido, con un Excel de referencia ("Distribucion_de_personas/puestos.xlsx"): saber la asignación de puesto/tarea/cantidad objetivo para cumplir una meta de producción — parecido en espíritu a Balance, pero con la asignación armada a mano, porque acá "puesto" se entiende como la persona/operario, no la máquina o el lugar físico donde se tomó el tiempo. **No modifica nada de lo ya existente** — es una pantalla nueva, aparte, que no toca Balance/Cobertura/Takt Time ni sus datos
- Pantalla nueva `SoldaduraPuestos.jsx`, chip "👷 Puestos" en el Inicio de Soldadura (junto al chip "📊 Distribución" que ya lleva a Balance — son dos herramientas distintas, no hay que confundirlas)
- Se elige Modelo + Capacidad + Línea (mismos selectores que Balance). Lista las tareas a soldar (subconjuntos + parciales con medición propia) con su tiempo estándar, tomado del mismo dato que ya usa Balance (`tiempoNorm` promedio del puesto donde más se midió cada código) — la diferencia es que ese puesto de origen ya no se usa para nada más: acá el usuario arma los puestos de cero (agregar/renombrar/eliminar, sin límite) y asigna cada tarea a mano con un selector
- Parámetros editables por Modelo/Cap/Línea: horas por turno, cantidad de turnos por día (con aviso si turnos × horas supera las 24hs del día), % de eficiencia, y la cantidad objetivo (meta)
- Por cada puesto calcula: carga total (TC, suma de los tiempos estándar asignados), unidades por hora/turno/día (ya con el % de eficiencia aplicado), y marca cuál es el "cuello de botella" (el puesto más cargado, que determina el ritmo real de toda la línea)
- Con la meta cargada, estima cuánto tiempo hace falta para cumplirla (horas, turnos, días) usando el ritmo del puesto cuello de botella — no el de cada puesto por separado, porque una unidad terminada necesita pasar por todos
- Avisa qué tareas quedaron sin asignar a un puesto (no entran en los cálculos hasta que se les asigne uno)
- Todo se guarda en Firestore (nueva colección `soldadura_puestos`, una distribución por combinación Modelo+Cap+Línea) — no se pierde entre sesiones
- Mismo criterio de permisos que Takt Time: el perfil Producción ve todo en modo solo lectura, no puede editar puestos/asignaciones/parámetros (lo arma Ingeniería/Admin)

### V280 — Tuberías: filtros de Modelo/Capacidad/Línea en Plano Plantilla, Pieza de Exportación y Agregado:
- Pedido con captura: en las 3 pantallas de listado por tipo de pieza (`TuberiasTipoAll.jsx`, compartida por PP/SP/AD) faltaba poder filtrar por Modelo, Capacidad y Línea antes de buscar un caño puntual — con cientos de registros por tipo (ej: 401 Planos Plantilla) era difícil ubicar el conjunto correcto solo con el buscador de texto
- Nuevos 3 desplegables arriba de la lista, encadenados igual que en el resto de la app (Capacidad se limita a las que existen para el Modelo elegido, Línea se limita a Modelo+Capacidad): elegir un Modelo resetea Capacidad y Línea, elegir Capacidad resetea Línea. Botón "× Limpiar" para sacar los 3 filtros de una vez
- Los filtros se aplican sobre la lista ya filtrada por modelos vigentes (V279) y antes del buscador de texto — buscar sigue funcionando en conjunto con los filtros, no los reemplaza
- El filtro de Línea usa el campo `lineaProd` ("Línea Prod.", columna D del Excel — IDU/ODU/ODU 2), no el campo `linea` (columna C, que trae otros valores como PORTATIL/WRAC según el modelo)
- Al aplicar alguno de los 3 filtros, aparece "N resultados" debajo de los desplegables (solo mientras haya al menos un filtro activo — con el buscador de texto solo, ese conteo ya lo da la lista de tarjetas debajo)
- El contador del título (ej: "Plano Plantilla (401)") sigue mostrando el total de piezas vigentes de ese tipo, sin filtrar — mismo criterio que ya tenía con el buscador de texto

### V279 — Tuberías: búsqueda sin modelos dados de baja + Resumen Tiempos con filtro por día:
- Pedido: (1) "Plano Plantilla (492)" y las demás pantallas de búsqueda/listado por tipo (PP/SP/AD) seguían mostrando piezas de modelos ya reemplazados en el Excel (ej: "Inverter EZ/GP R32" tras migrarlo a "Inverter EZ CB1 R32") — mismo problema que V276 había corregido en "Modelos que lo utilizan", pero no en esta pantalla; (2) poder ver qué caños se midieron en el día, igual que ya existe en Soldadura
- `TuberiasTipoAll.jsx`: mismo mecanismo que V276 — nuevo listener a `config/tuberia_meta`, la lista (y el contador del título) ahora se filtra a los modelos vigentes ahí antes de aplicar la búsqueda de texto. Un modelo dado de baja sigue con sus registros guardados (no se tocan), simplemente no aparece en este listado
- `TuberiasTiempos.jsx` ("Resumen Tiempos"): agregado el mismo `WeekCalendar` que ya usa Soldadura — semana navegable con puntito verde por día indicando cuántos planos tuvieron alguna medición esa fecha. Al elegir un día, la lista, los promedios por puesto y los totales se recalculan solo con las mediciones de esa fecha (con botón "× Ver todo el historial" para volver a la vista sin filtro); las pestañas de máquina (OMS-1, TJ-1...) se siguen mostrando según el historial completo (para no hacerlas aparecer/desaparecer al cambiar de día), pero el número entre paréntesis de cada una sí refleja el día elegido — mismo criterio "visibilidad vs. conteo" que ya usa el Resumen de Soldadura
- Los exports PDF y Excel de este Resumen ahora también respetan el día elegido (si hay uno seleccionado, solo exportan las mediciones de esa fecha, con el nombre del archivo y la leyenda del PDF indicando el día)

### V278 — Check List Soldadura (Calidad) ahora se puede editar:
- Pedido: el check list ya cargado solo se podía crear o borrar, no corregir — a diferencia de Check List Producto Terminado (que ya tenía edición desde que se armó, por su lógica de completarse de a poco).
- `CalidadChecklistSoldadura.jsx`: nuevo botón ✏️ en cada tarjeta de la lista (visible para todo perfil Calidad, mismo criterio que "+ Nuevo check list") que reabre ese registro en el mismo formulario, precargado con sus datos y respuestas. `guardar()` ahora usa `updateDoc` si se está editando un registro existente, o `addDoc` si es nuevo — mismo patrón `editId` que ya se usa en Check List Producto Terminado
- El título del modal cambia a "Editar check list" cuando corresponde, para dejar claro que no se está creando uno nuevo

### V277 — Fix: "Migrar modelo" no encontraba modelos con "/" en el nombre (ej: EZ/GP):
- Reportado: al migrar "Inverter EZ/GP R32" no borraba nada, sin ningún mensaje de error visible que lo explicara
- Causa: los IDs de documento en `soldadura_modelos`/`soldadura_tiempos` sanitizan la barra "/" a guión "-" al importar el Excel (Firestore no permite barras en un segmento de path — `Inverter EZ/GP R32_09FC` se guarda como `Inverter EZ-GP R32_09FC`). `migrarModelo()` armaba el prefijo de búsqueda con el nombre **tal cual lo escribís** (con la barra), así que nunca coincidía con los IDs reales (con guión) — la migración corría, no encontraba nada, y terminaba en el cartel "No se encontró nada guardado bajo X para migrar" sin que se notara la causa
- `SoldaduraHome.jsx` → `migrarModelo()`: el prefijo viejo ahora aplica el mismo `.replace(/\//g, '-')` que ya usa el nombre nuevo, antes de comparar contra los IDs guardados
- Afecta a cualquier modelo cuyo nombre tenga una barra — no es exclusivo de EZ/GP, cualquier "X/Y" en el Excel tiene el mismo problema hasta esta versión

### V276 — Fix: "Modelos que lo utilizan" listaba modelos dados de baja:
- Reportado con captura: una pieza compartida mostraba un modelo viejo ("Inverter EZ/GP R32 09FC") que ya no estaba en el Excel más reciente ni en la portada de Tuberías — confundía, parecía un modelo activo cuando en realidad ya había sido reemplazado
- Causa: al importar un Excel, solo se borran/recrean los modelos que están nombrados en **ese** Excel puntual — un modelo que deja de incluirse no se borra, sus registros quedan intactos "por atrás" (a propósito, para no perder fotos/tiempos compartidos), pero ya no figura en `config/tuberia_meta` (la lista que arma la portada)
- `TuberiasPiezaDetail.jsx`: nuevo listener a `config/tuberia_meta` — el panel "📦 Modelos que lo utilizan" ahora filtra y solo muestra modelos que siguen vigentes ahí. La propagación de fotos al subir/borrar sigue llegando a **todos** los hermanos, incluidos los de baja (por si el modelo se reactiva en un futuro Excel, no pierde la sincronización) — el filtro es solo visual, no toca qué recibe la foto

### V275 — Tuberías: PP también comparte fotos entre modelos, igual que SP/AD:
- Corrección sobre lo asumido en V274: el usuario aclaró que las piezas **PP (Plano Plantilla) también pueden ser la misma pieza física reutilizada entre modelos**, no son exclusivas de un solo modelo como se documentaba antes — de hecho es por eso que los tiempos (`tuberia_tiempos`, guardados por número de plano a nivel global) ya se comparten solos entre modelos desde siempre
- Al revisar el código para extender esto a las fotos, se confirmó que la carga masiva de imágenes (`TuberiasCargaImagenes.jsx`) **ya** matcheaba y subía fotos a todas las piezas que comparten plano, sin importar el modelo — no hacía falta tocarla. Faltaba nada más en dos lugares: la ficha individual de la pieza (subir/borrar una foto suelta) y el import de Excel (V274, que había quedado limitado a SP/AD)
- `TuberiasPiezaDetail.jsx`: el efecto que busca "piezas hermanas" ahora también contempla PP — para SP/AD sigue emparejando por `codigoCano` (entre sí, cualquiera de los dos tipos), para PP empareja por `plano` **y** `codigoCano` a la vez (los dos tienen que coincidir, no alcanza con uno solo — evita que dos PP de modelos distintos se crucen por una coincidencia de numeración). El panel "📦 Modelos que lo utilizan" ahora también aparece en piezas PP compartidas
- `TuberiasHome.jsx` → `handleImport()`: el mapa de fotos a heredar armado antes de borrar (V274) ahora también arma un mapa para piezas PP con fotos, con clave combinada `plano||codigoCano`, además del mapa por `codigoCano` para SP/AD
- Actualizada la documentación in-app (`Instrucciones.jsx`, paneles Admin y Externo) que decía "PP es pieza única de cada modelo" — ya no es así, puede ser compartida igual que SP/AD, solo que identificada por plano en vez de código caño

### V274 — Tuberías: fotos compartidas (SP/AD) se copian automáticamente al importar Excel:
- Pedido: al cargar tuberías/soldadura nuevas que comparten código caño con piezas ya existentes, ¿se comparten las fotos aunque sea una carga nueva? Respuesta: no, hasta ahora no — cada importación de Excel borra los registros del modelo y los recrea siempre con `fotos: []`, sin importar si comparten código caño con una pieza de otro modelo que ya tenía fotos. La sincronización de fotos entre SP/AD (V219 y anteriores) solo pasaba en el momento de **subir** una foto (se propaga a los que comparten `codigoCano` en ese instante), nunca al importar
- `TuberiasHome.jsx` → `handleImport()`: ahora, antes de borrar los registros del modelo que se está importando, arma un mapa `codigoCano → fotos` a partir de todas las piezas SP/AD que ya tengan fotos cargadas (de cualquier modelo, incluido el que se está reimportando). Al recrear los registros nuevos, si una pieza SP/AD tiene un `codigoCano` que está en ese mapa, arranca con esa foto puesta en vez de vacía
- Se arma el mapa **antes** de borrar (no después) — así también cubre el caso de reimportar el Excel del mismo modelo sin perder las fotos que ya tenía, no solo el caso de un modelo nuevo compartiendo código con uno viejo
- Solo aplica a piezas **SP y AD** (que ya eran las únicas con este concepto de "compartido entre modelos" vía código caño) — las piezas **PP** siguen sin compartirse entre modelos (nunca lo hicieron, cada una es única de su modelo) y sus fotos se siguen perdiendo si se reimporta el mismo modelo, eso no se tocó en esta versión
- **Soldadura no tiene un mecanismo equivalente** — a diferencia de Tuberías, ahí no existe ningún concepto de "subconjunto compartido entre modelos" ni siquiera manual: cada modelo+capacidad guarda sus fotos en su propio documento (`soldadura_tiempos/{modelo}_{cap}`), sin relación entre modelos aunque el código de subconjunto coincida. Si se quiere algo así en Soldadura, es una función nueva a construir, no una extensión de algo existente
- **Tiempos/mediciones**: no necesitan este tratamiento — en Tuberías, `tuberia_tiempos` se guarda por número de `plano` a nivel global (no por modelo), así que si dos modelos comparten el mismo número de plano, ya comparten las mediciones automáticamente por construcción, sin código adicional. En Soldadura las mediciones son siempre por modelo+capacidad, sin compartir nunca entre modelos — comportamiento intencional, no un gap

### V273 — Check List Producto Terminado: PDF y Excel dibujados celda por celda, calcados del oficial:
- Reportado tras V272 con capturas lado a lado: seguía sin coincidir. La causa de fondo era estructural, no de color — **`jspdf-autotable` no puede representar esta grilla**: el formulario tiene celdas combinadas en dos ejes a la vez (columna vertical rotada "Sub Conjunto Terminado" a la izquierda de todo, nombre de línea ODU1/IDU/ODU2 como celda gris *dentro* de la columna Ítem abarcando dos filas, y encabezado con Fecha/Auditor/Supervisor a la izquierda + Turno/muestreos a la derecha)
- `exportarPDF()` reescrita sin autoTable: nuevo helper `drawCell()` (rectángulo + relleno + texto centrado con wrap opcional) y la grilla se dibuja a mano con coordenadas calculadas — `vertW` 11mm (columna rotada) + `itemW` 92mm (preguntas) + 9 subcolumnas (3 muestreos × Sub Conjunto/Modelo/Lote). El alto de cada fila de pregunta se calcula con `splitTextToSize` según cuántas líneas ocupa su texto. Se sacó el import de `jspdf-autotable` de este archivo (los otros dos check lists lo siguen usando)
- `exportarExcel()` reescrita con la misma grilla de 11 columnas: A = "Sub Conjunto Terminado" rotado (`alignment.textRotation: 90`), B = Ítem, C..K = las 9 subcolumnas. Nombre de línea combinado en `B6:B7`, resultado de cada pregunta combinado en `C8:E8`/`F8:H8`/`I8:K8`, etc.
- Paleta corregida contra las capturas: título **azul #4472C4**, franja "Obs:" **azul grisáceo #B8CCE4**, "Ítem" y nombre de línea en **gris #D9D9D9**, etiquetas Sub Conjunto:/Modelo:/Lote: en **durazno claro #FCE4D6**, valores cargados y N/A en **durazno #F8CBAD**, OK verde / NOK rojo sólidos con texto blanco
- Verificado antes de entregar: se generó el PDF con los datos del ejemplo real del usuario y se renderizó a imagen para compararlo contra el formulario oficial (entra en una sola página, 180 de 210mm), y se inspeccionó el XML del .xlsx para confirmar los merges y la rotación

### V272 — Fix: Check List Producto Terminado no respetaba el color/formato del oficial:
- Reportado con capturas comparando el PDF exportado por la app contra el formulario real: usé por error la paleta de los otros dos check lists (título negro, header celeste) en vez de la paleta propia de este formulario (título **azul**, franjas **beige/crema**, "Sub Conjunto Terminado" y etiquetas Sub Conjunto:/Modelo:/Lote: en **gris**, valores cargados y N/A en **durazno**), y además cada muestreo mostraba un solo valor en vez de sus 3 subcolumnas reales (Sub Conjunto / Modelo / Lote)
- `CalidadChecklistProductoTerminado.jsx`: nuevas constantes de color `C_TITLE`/`C_CREAM`/`C_GREY`/`C_PEACH`/`C_OK`/`C_NOK` tomadas de las capturas del formulario oficial. PDF y Excel reescritos para desplegar cada muestreo en sus 3 subcolumnas (con `colSpan` en `jspdf-autotable` para las celdas de Sub Conjunto/Modelo/Lote y para el resultado OK/NOK/N/A, que ahora ocupa el ancho completo del muestreo, igual que en el original)
- Etiquetas "1er/2do/3er Muestreo" pasaron a "1° MUESTREO/2° MUESTREO/3° MUESTREO", igual al formulario oficial — se usa tanto en el formulario de carga como en los exports
- N/A ahora también se pinta (durazno), no queda neutro como en los otros dos check lists — es el color que usa el formulario oficial para esas celdas

### V271 — Calidad: tercer check list, "Producto Terminado de Soldadura" (primera versión, a revisar):
- Pedido con 3 PDF de referencia (template vacío, ejemplo real cargado, y evidencia fotográfica): un tercer formulario de Calidad, distinto de estructura a los otros dos
- **Particularidad de este check list**: el registro no es una muestra puntual ni una visita al puesto — es **el turno completo**. Se carga a lo largo del día en 3 rondas (1er/2do/3er muestreo), cada una con 3 líneas (ODU1/IDU/ODU2) y su propio Sub Conjunto/Modelo/Lote + 4 preguntas fijas. Confirmado con el usuario: sin nivel de "muestreo" separado de "muestra" (son 3 muestras por línea a lo largo del turno), un solo registro por Fecha+Turno completado de a poco, evidencia fotográfica de NOK igual que Check List Soldadura, controles OK/NOK/N/A (sin "Obs.")
- Nuevo tile "📦 Check List Producto Terminado" en `CalidadHome.jsx`, nueva pantalla `CalidadChecklistProductoTerminado.jsx` (`/calidad/producto-terminado`), nueva colección `calidad_checklist_producto_terminado`
- **Un solo registro por Fecha+Turno**: al cambiar Fecha o Turno en el formulario, si ya existe un registro con esa combinación (y no es el que se está editando), se ofrece abrirlo en vez de crear uno duplicado — así "el primero se mantiene, se suma el segundo y el tercero" sin perder lo ya cargado. Botón ✏️ en cada card de la lista para reabrir y continuar/corregir
- Cada línea (ODU1/IDU/ODU2) es una sección colapsable con sus 3 muestreos adentro — formulario largo por la estructura misma del documento oficial, se colapsa para no abrumar
- Evidencia fotográfica de NOK: mismo mecanismo que Check List Soldadura (`FotoNOK`, cámara/galería, Cloudinary) — botón 📎 en la lista exporta el PDF "Evidencia Fotográfica de NC" agrupado por línea
- Exporta PDF (apaisado, título en barra negra, líneas agrupadas con celeste, colores sólidos OK verde/NOK rojo) y Excel (mismo formato, ExcelJS con logo real), por registro — mismo patrón que los otros dos check lists
- **Es una primera versión** — a diferencia de los otros dos formularios (que se fueron ajustando con capturas reales tras la primera carga), este se armó interpretando el PDF de referencia sin poder validar la carga real todavía. Es esperable pedir ajustes de formato/color después de probarlo con datos reales, como pasó con Check List Soldadura en V251/V252

### V270 — Calidad Tuberías: campos "Longitud según Plano" / "Longitud de Corte" + Máquina como desplegable:
- Pedido con capturas del PDF y del Excel de referencia: agregar dos controles más entre "Caudal (Medición)" y "Abocardado" — "Longitud según Plano" y "Longitud de Corte", aceptando número o "N/A"
- `CalidadAuditorias.jsx`: nuevos campos `longitudPlano`/`longitudCorte` — texto libre (no select OK/NOOK, igual que Diámetro externo y Caudal), agregados en `RAW_COL_DEFS` en esa posición exacta así salen ahí tanto en el PDF como en el Excel, y en el formulario de carga justo debajo de Diámetro externo/Caudal
- **Máquina** pasó de campo de texto libre a desplegable, con la misma lista de puestos que ya usa Tuberías (`OMS-1, OMS-2, TJ-1 a TJ-4, BLM, CC, CTDA`) — nueva constante `PUESTOS_TUBERIA` duplicada acá (como ya pasa con `PUESTOS` en 4 archivos de Tuberías, no hay fuente única compartida); si se agrega una máquina nueva en Tuberías hay que sumarla también acá
- Los registros ya cargados quedan con sus valores de Máquina como texto libre (ej: "Oms1", "Blm") — no se migran, siguen mostrándose igual; solo los controles nuevos usan el desplegable con los nombres canónicos

### V269 — Fix: Cobertura perdía el filtro de Modelo/Capacidad al volver de medir:
- Reportado: aplicar filtro en Cobertura, entrar a medir un plano y volver atrás (fix de navegación de V267) hacía perder el filtro — quedaba en blanco y había que volver a elegirlo, tedioso con uso repetido
- `TuberiasCobertura.jsx`: al navegar a medir un plano, ahora manda el filtro actual (`{ modelo, cap }`) junto con el origen en el `state` de navegación. Al volver (botón ← del cronómetro, ya devuelve a Cobertura desde V267), ese mismo `state` viaja de vuelta — `TuberiasCobertura` lo lee al montarse y restaura `selectedModelo`/`selectedCap` en vez de arrancar vacío
- Si se entra a Cobertura de cero (desde el menú de Tuberías, sin venir de "volver"), el filtro arranca vacío como siempre — el pedido de que se borre al volver al menú ya se cumple solo, porque ese camino nunca manda `filtro` en el `state`
- No se tocó `TuberiasCronometro.jsx` — el mecanismo de "volver con el mismo state que llegó" (`backState={location.state}`) ya existía desde V217, solo hacía falta que Cobertura mandara el filtro dentro de ese state y lo leyera de vuelta

### V268 — Ajuste de UI: velocidad de máquina pasa de chips a un solo recuadro editable:
- Pedido tras probar V267: reemplazar los 3 chips (80/90/100) + input "Otro" por un único recuadro numérico, que siempre muestre un valor (100% salvo que se cambie) y se resetee al cambiar de pantalla
- `TuberiasCronometro.jsx` (`PuestoTimer`): sacados los chips — ahora es un solo `<input type="number">` grande y centrado, mismo estilo visual que el campo de segundos manuales, con el signo % al lado. Sigue arrancando en `'100'` por defecto y reseteándose solo al desmontarse el componente (cambio de pantalla), como ya pasaba — no fue necesario tocar esa lógica, solo la UI
- Actualizadas las menciones en `Instrucciones.jsx` (paneles Admin, Ingeniería y Glosario) que describían los chips 80/90/100, para que coincidan con el recuadro único

### V267 — Tuberías: velocidad de máquina por medición + fix de navegación desde Cobertura:
- **Velocidad de máquina**: pedido — las máquinas semiautomáticas de Tuberías trabajan a distinto ritmo (80/90/100%) y es un dato que quieren conservar por medición. Nuevo campo `velocidad` en cada medición de `tuberia_tiempos`
- `TuberiasCronometro.jsx` (`PuestoTimer`): nuevo bloque "⚡ Velocidad de máquina (%)" con 3 chips rápidos (80/90/100) + input libre para otro valor. A diferencia del comentario (que se vacía después de cada guardado), la velocidad **no se resetea al guardar ni al cerrar el panel** — qu​eda en memoria del componente hasta que se cambia de pantalla, para no reingresarla en cada medición si la máquina sigue al mismo ritmo
- Se muestra en el historial de mediciones de cada puesto (`Vel. 90%` junto a la fecha) y en el resumen del puesto (`Vel. prom: 88%`)
- **Exports**: `TuberiasTiempos.jsx` — PDF agrega columna "Vel." por medición (y el promedio de velocidad en la fila de Promedio por plano); Excel muestra el promedio de velocidad entre paréntesis junto al tiempo de cada puesto (ej: `00:01:30:00 (Vel. 90%)`) ya que ese export es agregado por plano, no por medición individual
- Es un campo opcional y nuevo — las mediciones ya cargadas antes de esta versión no tienen velocidad y se muestran igual, sin el dato (no se les asigna nada retroactivo)
- **Fix de navegación**: reportado — al entrar a medir un plano desde Cobertura, el botón atrás (←) mandaba siempre al listado general de "Tiempos" en vez de volver a Cobertura. Causa: `TuberiasCronometro.jsx` tenía el "volver" fijo en `/tuberias/tiempos` para la ruta `/tuberias/tiempos/:plano`, sin considerar el origen real de la navegación. Fix: `TuberiasCobertura.jsx` ahora pasa `state: { back: '/tuberias/cobertura' }` al navegar, y `TuberiasCronometro.jsx` usa ese origen si vino con uno — si no, sigue yendo a Tiempos como antes (no rompe el flujo existente desde el Resumen)
- De paso, corregida una imprecisión que había en `Instrucciones.jsx`: el panel de Admin e Ingeniería decían que medir en Tuberías pedía "operario, cantidad y valoración%" — eso es exclusivo de Soldadura (ver "Decisiones de diseño" en este archivo), Tuberías nunca lo pidió. Se corrigió el texto y se sumó la mención de velocidad, además de una entrada nueva en el Glosario general

### V266 — Tuberías: nuevo puesto CTDA:
- Pedido: agregar una máquina semiautomática nueva llamada CTDA, al mismo nivel que OMS-1/OMS-2/TJ-1 a TJ-4/BLM/CC, para poder tomarle tiempos
- La lista de puestos de Tuberías está duplicada como constante `PUESTOS` en 4 archivos (no hay una fuente única compartida) — se agregó `'CTDA'` al final en los 4: `TuberiasCronometro.jsx` (cronómetro), `TuberiasTiempos.jsx` (resumen/exportación), `TuberiasCobertura.jsx` (cobertura de mediciones) y `TuberiasPiezaDetail.jsx` (selector de puesto en la ficha de la pieza)
- También actualizado `PUESTOS_TUB` en `Instrucciones.jsx` (panel Admin) y la mención en el Glosario general, para que la documentación no quede desactualizada
- No requiere ninguna migración de datos — es solo una opción más en los selectores de puesto, las mediciones ya cargadas no se tocan

### V265 — Fix: el perfil "solo Calidad" no tenía forma de llegar a Instrucciones:
- Reportado con captura: un usuario con únicamente el perfil Calidad veía el Inicio reducido (Calidad + Avisos, mismo patrón que Externo desde V246) pero nunca tuvo el tile de Instrucciones — así que el glosario agregado en V264 quedaba inalcanzable para esa persona
- `Home.jsx`: agregado el tile "📖 Instrucciones" a la rama `soloCalidad` de tiles, mismo que ya tenían Admin/Ingeniería/Producción
- Un usuario con perfil Calidad + algún otro perfil (ej: Admin) ya lo veía bien — el bug era solo para "Calidad" como único perfil

### V264 — Glosario de definiciones para el perfil Calidad:
- Pedido: al perfil Calidad le faltaba el instructivo con definiciones que sí tienen los demás perfiles — el Glosario general (T.Obs, T.N, Ciclo, Takt...) se muestra siempre en Instrucciones pero es de tiempos, no aplica a auditorías
- Nueva `SectionCard` "📖 Glosario de Calidad" dentro de `PanelCalidad` (Instrucciones.jsx), con el mismo componente `VarRow` que ya usa el Glosario general: define OK, NOOK, Obs. (aclarando que guarda `'OBS'` internamente y que solo existe en Auditoría de Tubería, no en Check List Soldadura), N/A, los dos formularios oficiales (FR-AC.032 y FR-AC.001-01), el ID correlativo de Auditoría de Tubería, los subroles Jefe/Supervisor/Auditor, y el campo Legajo/N° Dispositivo
- De paso se agregó a la sección "Check List Soldadura" del mismo panel la mención de la evidencia fotográfica de NC (📎) que faltaba documentar desde que se implementó en V254
- Cambio puramente de documentación dentro de la app, no toca lógica ni datos

### V263 — Calidad Tuberías: ID correlativo por cada control cargado:
- Pedido con capturas de la lista y del PDF exportado: agregar un ID a la izquierda de todo, por cada control nuevo, visible en el momento de cargarlo y en ambos exports
- Nuevo campo `idControl` en `calidad_auditorias` — correlativo creciente (`nextIdControl()`: uno más que el mayor ya usado en todo el historial, no por fecha), asignado apenas se abre "+ Nueva muestra auditada" para que el auditor lo vea antes de cargar los datos (badge "ID #4" arriba del formulario)
- Se agregó como primera columna en `RAW_COL_DEFS`, así sale a la izquierda de todo automáticamente tanto en el PDF como en el Excel (comparten la misma definición de columnas)
- También visible en la tarjeta de cada registro de la lista, antes del código de muestra
- Los registros ya cargados antes de esta versión quedan sin ID (columna vacía) — no se les asignó uno retroactivo para no reordenar ni pisar nada; los controles nuevos arrancan en base al mayor ID existente, así que no hay colisión

### V262 — Prueba: solicitud de creación de cuenta con aprobación de Administración:
- Pedido: que cualquiera pueda pedir una cuenta desde la pantalla de Login, y que quede sujeta a aprobación de un Admin en vez de que el Admin tenga que crear cada perfil a mano de entrada
- Nueva colección `tubysol_solicitudes`: cada doc = `{ nombre, rol, subrol (solo si rol=Calidad), password, estado: 'pendiente'|'aprobada'|'rechazada', creadoEn, resueltoEn }`
- `Login.jsx`: nuevo link "¿No tenés cuenta? Solicitar acceso" debajo del formulario — abre un modal para elegir nombre, perfil (Ingeniería/Producción/Externo/Calidad/Administrador — con subrol si es Calidad) y una contraseña propia. Al enviar queda en estado `pendiente`, sin dar acceso todavía. Bloquea el reenvío si ya hay una solicitud pendiente con el mismo nombre+perfil
- `GestionUsuarios.jsx` (Admin): nueva sección arriba de todo con las solicitudes pendientes — nombre, perfil pedido, contraseña propuesta (oculta/mostrar) y botones ✓ Aprobar / ✗ Rechazar. Al aprobar, si ya existe un usuario con ese nombre le suma el perfil nuevo (mismo patrón que "Agregar perfil"); si no existe, lo crea. Las solicitudes ya resueltas quedan colapsadas en "Ver solicitudes resueltas" en vez de desaparecer, para tener registro
- `Home.jsx`: el botón "⚙️ Usuarios" (solo Admin) ahora muestra un contador rojo con la cantidad de solicitudes pendientes, mismo patrón visual que el badge de Avisos
- Es una prueba — como con otras funciones nuevas de la app (ver V245, Ficha técnica), si en el uso real no resulta cómoda se puede revertir limpio
- **Nota de seguridad**: como las reglas de Firestore siguen abiertas (`allow read, write: if true`, tema pendiente ya conversado y pausado), cualquiera con la URL de la app puede escribir una solicitud directamente en la base sin pasar por este formulario — no es un agujero nuevo que abra esta función, es el mismo riesgo de fondo ya conocido. La aprobación manual del Admin sigue siendo el filtro real antes de que una solicitud se convierta en una cuenta con acceso

### V261 — Perfil Calidad subdividido en Jefe / Supervisor / Auditor:
- Pedido: dentro del perfil Calidad, distinguir Jefe, Supervisor y Auditor
- Se aclaró con el usuario el alcance: Auditor puede cargar y exportar igual que los demás, pero **no puede borrar registros** — Jefe y Supervisor sí, con las mismas capacidades entre sí (no hay diferencia funcional entre esos dos por ahora)
- No es un perfil nuevo — sigue siendo una sola contraseña de Calidad por persona, con un `subrol` (`jefe`/`supervisor`/`auditor`) guardado junto al perfil en `perfiles.calidad` (`tubysol_usuarios`)
- `GestionUsuarios.jsx` (Admin): al agregar un perfil Calidad ahora pide elegir el subrol además de la contraseña; los perfiles Calidad ya cargados muestran un desplegable para asignar/cambiar el subrol sin tener que recrear el perfil
- `AuthContext.jsx`: el login ahora lee `subrol` del perfil Calidad y expone `puedeBorrarCalidad` (`true` para Admin, Jefe, Supervisor, o un perfil Calidad viejo sin subrol asignado todavía — `false` solo para Auditor)
- Los botones 🗑 de `CalidadAuditorias.jsx` y `CalidadChecklistSoldadura.jsx` pasaron de `isCalidad` a `puedeBorrarCalidad` — Auditor ya no ve el botón de borrar en ninguno de los dos formularios
- `Instrucciones.jsx` → `PanelCalidad` documenta la subdivisión y aclara que la diferencia de permisos es solo con Auditor
- **Acción pendiente para el usuario**: los perfiles Calidad que ya existían quedan sin subrol asignado (siguen pudiendo borrar, como antes, para no sacarle funcionalidad a nadie de golpe) — conviene entrar a Gestión de Usuarios y asignarle Jefe/Supervisor/Auditor a cada uno

### V260 — Calidad Tuberías: nueva opción "Obs." (amarillo) en los controles:
- Pedido con captura del PDF exportado: agregar una cuarta opción a los controles de Auditoría de Tubería (además de OK/NOOK/N/A), para observaciones que no son ni aprobación ni rechazo — color amarillo para distinguirla
- `OkNaSelect` ahora tiene 5 opciones: `—` / `OK` / `NOOK` / `Obs.` (guarda `'OBS'`) / `N/A`
- Coloreada igual en los 3 lugares donde ya se pintaban OK verde/NOOK rojo: PDF (`didParseCell`, amarillo `rgb(255,249,196)` con texto `rgb(245,127,23)`), Excel (mismo amarillo vía `obsFill`), y las badges de la lista de registros
- Solo se tocó `CalidadAuditorias.jsx` (Tuberías) — el Check List Soldadura (`CalidadChecklistSoldadura.jsx`) sigue siendo OK/NOOK únicamente, como pide su formulario oficial FR-AC.001-01

### V259 — Compresión liviana de fotos antes de subir a Cloudinary:
- Pedido tras la duda de V258 ("¿me puede generar el comprimido algún problema?"): comprimir las fotos antes de subirlas, para que la subida sea más liviana con mala señal en planta, sin que se note la pérdida de calidad
- Nuevo `utils/compressImage.js`: redimensiona a un máximo de 1600px de lado más largo y recodifica a JPEG calidad 0.8 (balanceado) usando `canvas`/`createImageBitmap`, todo en el navegador antes del `fetch` a Cloudinary — no se subió ninguna librería nueva
- Si la foto ya pesa poco (≤300 KB), es GIF, o el resultado comprimido termina pesando más que el original (fotos ya muy comprimidas por el celular), sube el archivo tal cual sin tocarlo — nunca empeora el resultado
- Cualquier falla en el proceso (formato no soportado, etc.) cae en un `catch` que sube el original — la compresión nunca puede bloquear una subida
- Aplicado en **todos** los puntos donde la app sube fotos tomadas por el usuario: `PhotoGrid.jsx` (soldadura/tuberías), `AvisosList.jsx`, `TuberiasPiezaDetail.jsx`, `TuberiasCargaImagenes.jsx` y `SoldaduraCargaImagenes.jsx` (carga masiva — acá es donde más se nota, con cientos de fotos a la vez), y `FotoNOK` en `CalidadChecklistSoldadura.jsx` (evidencia fotográfica de NC)
- **No aplicado** en la subida del logo de Calidad (`CalidadAuditorias.jsx` → `uploadLogoToCloudinary`) ni en los PDF de Visualizadores (`GestionVisualizadores.jsx`) — el logo puede tener transparencia (se perdería al pasar a JPEG) y los PDF no son imágenes

### V258 — Fix: el título de categoría en el PDF de Evidencias quedaba fuera del recuadro:
- Reportado con captura de prueba: el texto rotado "1 - DOCUMENTACIÓN" aparecía fuera de la columna izquierda en vez de centrado adentro
- Causa: jsPDF no calcula bien la combinación de `align: 'center'` con texto rotado (`angle`) — el cálculo de centrado se hace como si el texto fuera horizontal y después rota el resultado, corriéndolo fuera de la caja
- Fix en `exportarEvidenciasPDF()`: se saca el `align` y se centra a mano, corriendo el punto de inicio hacia abajo la mitad del ancho del texto (`pdf.getTextWidth()`) para que quede centrado verticalmente una vez rotado

### V257 — Fix: la foto de evidencia NOK solo ofrecía galería, no cámara directa:
- Reportado: al subir la foto de evidencia en una pregunta NOK, el navegador abría directo la galería sin dar la opción de sacar la foto en el momento
- `FotoNOK` en `CalidadChecklistSoldadura.jsx` tenía un único input de archivo sin el atributo `capture`, así que el navegador elegía la fuente por su cuenta (normalmente galería) en vez de ofrecer las dos opciones
- Fix: separado en dos botones — "📷 Cámara" (`capture="environment"`) y "🖼 Galería" — mismo patrón que ya usa `PhotoGrid.jsx` en el resto de la app

### V256 — WeekCalendar: botón para saltar directo a una fecha lejana:
- Reportado tras V255: navegar semana por semana con ‹ › es lento cuando Calidad necesita consultar fechas de meses atrás para un análisis
- Nuevo botón "📅" en `WeekCalendar.jsx`, junto a las flechas — abre el selector de fecha nativo del navegador (oculto, disparado por ese botón) para elegir cualquier fecha de una vez; al elegirla, la semana visible salta directo a la que la contiene y la selecciona
- El calendario nativo acá se usa solo como accesorio para saltar rápido, no como el filtro visible principal — los puntos verdes con la cantidad de registros por día se siguen viendo en la semana, que es lo que el nativo no puede mostrar

### V255 — Calendario con días resaltados en los dos formularios de Calidad:
- Pedido: el selector de fecha de Calidad (Auditoría de Tubería y Check List Soldadura) usaba el calendario nativo del navegador, que no permite marcar qué días tienen datos cargados
- Nuevo `components/WeekCalendar.jsx` — mismo patrón "semana con puntos verdes" que ya usa el Resumen de Soldadura/Tuberías (no se podía usar el `<input type="date">` nativo para esto porque el navegador no permite customizar su calendario)
- Reemplaza el `<input type="date">` del filtro en `CalidadAuditorias.jsx` y `CalidadChecklistSoldadura.jsx` — cada día de la semana muestra un puntito verde con la cantidad de registros de esa fecha, navegable con ‹ › entre semanas
- No se tocó el campo Fecha dentro de los formularios de carga (esos siguen siendo `<input type="date">` normales, tiene sentido ahí porque es una fecha libre a elegir, no un filtro sobre datos ya existentes)

### V254 — Calidad: evidencia fotográfica de NC, documento aparte exportable:
- Pedido: cuando una pregunta del Check List Soldadura da NOK, poder adjuntar una foto de evidencia, y exportarla en un documento separado (no mezclado con el check list), dividido por las mismas 3 categorías, calcado al formulario oficial "Evidencia Fotográfica de NC"
- `CalidadChecklistSoldadura.jsx`: cada pregunta ahora tiene `fotoUrl` en su respuesta — el campo de carga de foto (cámara/galería, mismo patrón de Cloudinary que `PhotoGrid.jsx`) solo aparece en el formulario cuando esa pregunta puntual está marcada NOK
- Nuevo botón "📎" en la lista, visible solo si el registro tiene al menos una pregunta NOK con foto cargada — genera un PDF aparte ("EVIDENCIA FOTOGRAFICA DE NC") con un bloque por cada NOK fotografiado: franja celeste de título, columna de categoría rotada a la izquierda, la foto (ajustada manteniendo proporción), y la observación como leyenda debajo
- Pagina automáticamente si no entran todos los bloques en una hoja, repitiendo la franja de título en cada página nueva — no arma un "PDF por evidencia", arma un solo documento con todas las evidencias de ese registro juntas

### V253 — Calidad: Check List Soldadura también exporta a Excel, mismo formato que el PDF:
- Pedido: el mismo formato que ya tiene el PDF exportado, ahora en Excel
- Nuevo botón "📊" por registro en `CalidadChecklistSoldadura.jsx`, junto al de PDF — usa `ExcelJS` (ya sumada en V249 para el Excel de Tuberías, sin agregar ninguna librería nueva)
- Mismo layout que el PDF: logo real incrustado, título en barra negra, código de documento, datos generales (Fecha/Turno/Auditor/Supervisor/Sub Conjunto/Modelo/Puesto), y la tabla de preguntas con la categoría agrupada (`mergeCells` en vez de `rowSpan` de autoTable), Legajo/N° Disp en su propia columna, y colores sólidos OK verde / NOK rojo con texto blanco

### V252 — Fix: Legajo/N° Disp como columna propia y colores sólidos, según captura real:
- Reportado con captura de la planilla real rellena: el Legajo/N° Dispositivo es una **columna independiente** de Observación (se puede completar los dos datos a la vez en 1.1/2.1, uno no reemplaza al otro como quedó en V251), y los colores OK/NOK son **sólidos** (verde y rojo plenos con texto blanco), no la versión pastel que se usó antes
- `CalidadChecklistSoldadura.jsx` → `exportarPDF()`: la tabla pasó a 5 columnas (Categoría agrupada, Pregunta, Resultado, Legajo/N° Disp, Observación) — Legajo/N° Disp solo se completa en 1.1/2.1, vacío en el resto; Observación queda libre para cualquier fila
- Colores del Resultado: verde `rgb(0,176,80)` para OK, rojo `rgb(255,0,0)` para NOK, con texto blanco — igual a la planilla oficial en vez de los tonos pastel `#e8f5e9`/`#ffebee` usados en el resto de la app

### V251 — Fix: el PDF del Check List Soldadura no coincidía con el formato oficial:
- Reportado con captura comparando el PDF exportado por la app contra el formulario real: la categoría (Documentación/Herramientas/Orden) se repetía en cada fila como columna aparte, y el Legajo/N° Dispositivo de las preguntas 1.1/2.1 quedaba mezclado dentro del texto de Observación en vez de ser el contenido principal de esa celda
- `CalidadChecklistSoldadura.jsx` → `exportarPDF()`: la categoría ahora usa `rowSpan` de `jspdf-autotable` para aparecer una sola vez por grupo (igual que el formulario original), y en 1.1/2.1 la celda de Observación muestra "LEGAJO:" / "N° DISPOSITIVO:" con el valor debajo en negrita como contenido principal, en vez de concatenado con el texto libre
- La tabla pasó de 5 columnas (#, Categoría, Pregunta, Resultado, Observación) a 4 (Categoría agrupada, Pregunta, Resultado, Observación), coincidiendo con la estructura real del FR-AC.001-01

### V250 — Calidad: segundo tipo de auditoría, "Check List Proceso de Soldadura" (FR-AC.001-01):
- Pedido: Calidad tenía un segundo formulario oficial distinto al de Tuberías — el "Check List Proceso de Soldadura" (FR-AC.001-01) — con estructura completamente distinta: no es una tabla de filas repetibles, es **un formulario por visita al puesto**, con preguntas fijas agrupadas en 3 categorías (Documentación, Herramientas, Orden/Demarcación/Limpieza)
- Nuevo hub `pages/calidad/CalidadHome.jsx` (`/calidad`) con dos tiles — "🔩 Auditoría de Tubería" (lo ya construido, ahora en `/calidad/tuberia`) y "🔧 Check List Soldadura" (nuevo, `/calidad/soldadura`) — porque los dos formularios son demasiado distintos para compartir una sola pantalla
- Nueva colección `calidad_checklist_soldadura`: cada doc = un check list completo (Fecha, Turno, Auditor, Supervisor, Sub Conjunto en proceso, Modelo, Puesto N°, y las 12 preguntas fijas con su Resultado OK/NOK + Observación — dos de ellas, 1.1 y 2.1, con un campo extra propio: Legajo y N° Dispositivo)
- Nueva pantalla `pages/calidad/CalidadChecklistSoldadura.jsx`: formulario de carga agrupado por categoría, lista filtrada por fecha con contador de puntos NOK por registro, borrado (Calidad/Admin), y exportación a PDF **por registro individual** (a diferencia de Tuberías que exporta por fecha) — tiene sentido porque acá cada registro ya es un documento completo en sí mismo, con el mismo layout del formulario FR-AC.001-01 y los mismos colores OK verde / NOK rojo
- Reutiliza el mismo logo configurado en `config/calidad_logo` — no hace falta subirlo de nuevo para este segundo formulario
- Excel no incluido todavía para este formulario (no se pidió) — si hace falta más adelante, se suma igual que se hizo con Tuberías

### V249 — Calidad: el Excel exportado ahora incluye el logo real (cambio de librería a ExcelJS):
- Pedido tras V248: ¿se puede meter el logo real (no solo el texto) en el Excel, igual que en el PDF?
- Investigado: `xlsx-js-style` (sumada en V248) es solo de estilos, no soporta imágenes — ninguna variante gratuita de SheetJS lo hace (es una función exclusiva de la versión Pro/paga)
- Encontrada una alternativa gratuita que sí soporta imágenes: **ExcelJS** (MIT, con build específico para navegador) — reemplaza a `xlsx-js-style` en este export puntual (se desinstaló una, se instaló la otra; no quedan las dos)
- `exportarExcel()` reescrita con la API de ExcelJS: mismo título en barra negra, código de documento, encabezado celeste y colores OK/NOOK que ya tenía, más el logo real incrustado arriba a la izquierda — la misma imagen que ya está subida en "⚙️ Configurar logo del PDF" (`config/calidad_logo`), sin pedirle al usuario que suba nada de nuevo
- Sigue siendo una librería grande (esperable en cualquier librería que lea/escriba .xlsx completo) — no se agregó una segunda encima de la que ya usa el resto de la app (`xlsx`), sigue siendo una sola librería extra para este export puntual

### V248 — Calidad: borrado también desde el perfil, y Excel con el mismo formato visual del PDF:
- Pedido tras probar V247: (1) el botón de borrar registros era exclusivo de Admin — Calidad no podía corregir sus propios errores de carga; (2) el Excel exportado tenía los datos pero no la presentación (barra de título, encabezado celeste, colores OK/NOOK) que sí tiene el PDF
- Borrado: el botón 🗑 de cada muestra ahora usa `isCalidad` (que ya incluye Admin) en vez de `isAdmin` — Calidad puede borrar sus propias muestras cargadas, no solo el Administrador
- Excel con formato: la librería `xlsx` (gratuita, ya usada en el resto de la app) no soporta colores de celda ni encabezados con relleno — para lograr el mismo look que el PDF se sumó `xlsx-js-style`, un fork de SheetJS con soporte de estilos, con la misma API. Solo se usa en este export puntual, no se tocó ningún otro export existente
- El Excel ahora sale con: título en barra negra (fila combinada), código de documento (FR-AC.032 / REV: 01 / FECHA), encabezado celeste igual que el PDF, y celdas OK en verde / NOOK en rojo
- No incluye el logo como imagen — ninguna variante gratuita de estas librerías soporta incrustar imágenes en el .xlsx, a diferencia del PDF que sí lo permite
- **Costo a tener en cuenta**: `xlsx-js-style` es una librería grande (agrega ~320 KB comprimidos al bundle) porque duplica buena parte del motor de SheetJS que ya trae la librería `xlsx` original — aceptable por ahora porque es una herramienta de uso puntual (Calidad/Admin), no algo que cargue todo el mundo constantemente

### V247 — Calidad: opción NOOK, colores OK/NOOK en el PDF y exportación a Excel:
- Pedido tras probar V246: faltaba la opción "NOOK" (rechazo) en los controles, el PDF exportado no distinguía visualmente OK de NOOK, y hacía falta poder exportar a Excel con el mismo formato
- `CalidadAuditorias.jsx`: el desplegable de cada control ahora tiene `—` / `OK` / `NOOK` / `N/A`
- Export a PDF: usa el hook `didParseCell` de `jspdf-autotable` para pintar cada celda de control — verde si es OK, rojo si es NOOK — solo en las columnas de control (no en Auditor/Observaciones, aunque el texto coincida)
- Nuevo botón "📊 Exportar Excel" junto al de PDF, mismas columnas y mismo filtro de fecha, usando `XLSX` (ya usado en los demás reportes de la app)
- Las columnas quedaron centralizadas en `RAW_COL_DEFS` y una función `celda()` compartida entre PDF y Excel, para que ambos exports salgan siempre iguales sin duplicar la lista de columnas dos veces

### V246 — Nuevo perfil "Calidad": auditoría de Tubería (corte y conformado) con carga guiada y exportación a PDF:
- Pedido: reemplazar la carga manual del Excel/PDF de auditoría de calidad (formulario FR-AC.032) por un formulario dentro de la app, exportando después un PDF con el mismo formato oficial
- Nuevo rol **Calidad** en el sistema de perfiles (`AuthContext.jsx`, `Login.jsx`, `GestionUsuarios.jsx`) — igual que Ingeniería/Producción/Externo/Administrador, con nombre y contraseña propios por persona
- Nueva colección `calidad_auditorias`: cada doc = una muestra auditada (Fecha, Código de muestra, ID-Plano Plantilla, Hora, Turno, Auditor, Máquina, los 9 controles OK/N/A, Diámetro externo, Caudal, Observaciones)
- Nueva pantalla `pages/calidad/CalidadAuditorias.jsx` (`/calidad`): formulario de carga por muestra, lista filtrada por fecha, borrado exclusivo de Admin, y botón "Exportar PDF" que genera el reporte con el mismo layout del formulario FR-AC.032 (recuadro de código/revisión/fecha, título en barra negra, tabla con las 19 columnas exactas) usando `jsPDF` + `jspdf-autotable`, ya usados en la app para los demás reportes
- **Logo configurable**: el logo del PDF exportado no queda fijo en el código — se sube a Cloudinary desde un panel "⚙️ Configurar logo del PDF" (exclusivo Admin) dentro de la misma pantalla, y se guarda en `config/calidad_logo`. Sin logo configurado, el PDF se exporta igual, solo sin la imagen
- Nuevo tile "📋 Calidad" en el Inicio (visible para Calidad y Admin) — un usuario con *solo* el perfil Calidad ve un Inicio reducido (Calidad + Avisos), igual que ya hace Externo
- `Instrucciones.jsx` actualizado con un panel nuevo para Calidad, para no repetir el desfasaje de documentación que se corrigió en V239
- Como con la Ficha Técnica de V245, se arma para probarlo — si no resulta funcional en el uso real, se revierte igual de limpio con `git revert`

### V245 — Revertida la ficha técnica imprimible:
- La V245 anterior (ficha técnica de subconjunto, `FichaTecnicaModal.jsx`) se probó y se decidió que no era muy funcional para el uso diario — revertida por completo (`git revert`) antes de darla por buena
- Vuelve a quedar como estaba en V244: sin `FichaTecnicaModal.jsx`, sin el botón "🖨 Ficha técnica imprimible" en `SoldaduraDetail.jsx`, sin las reglas `.ficha-*` / `@media print` en `index.css`
- Si en el futuro se retoma la idea, conviene repensar el enfoque (quizás más liviano, o resuelto de otra forma) en vez de recuperar este commit tal cual

### V244 — Administrador ahora es un perfil más en Gestión de Usuarios:
- Reportado: no se podía agregar a otra persona como Administrador
- Causa: "Administrador" nunca fue un perfil del sistema de `tubysol_usuarios`/`perfiles` que ya usan Ingeniería/Producción/Externo — era una única cuenta maestra hardcodeada en `AuthContext.jsx` (usuario y contraseña fijos en el código), separada por completo de ese sistema. `GestionUsuarios.jsx` ni sabía que "Admin" podía asignarse
- Fix: se agregó `'Administrador'` a `ROLES`/`ROLE_KEYS`/`ROLE_COLORS` en `GestionUsuarios.jsx` — ahora se le puede dar de alta un perfil de Admin a cualquier usuario, con nombre y contraseña propios, igual que a los demás roles
- `AuthContext.jsx`: `login()` ahora, si se ingresa un nombre para "Administrador", valida contra `perfiles.admin` en Firestore (mismo esquema que los otros roles) en vez de la contraseña maestra
- `Login.jsx`: el campo "Tu nombre" ahora aparece también para Administrador, pero **opcional** — vacío mantiene el acceso maestro de siempre (usuario/contraseña sin cambios, no se pierde el login existente), completo valida como perfil propio
- No se tocó ni se invalidó el acceso maestro existente — es aditivo

### V243 — PdfViewerModal: botones "Reintentar" y "Abrir directo" para cuando el visor de Google falla:
- Reportado: al abrir un visualizador desde Ingeniería o Externo, a veces aparece una pantalla de error del visor de Google ("No se pudo descargar: Sin archivo") en vez del PDF — intermitente, sin causa clara
- Es una falla externa de `docs.google.com/viewer` (timeout de su lado, o un intento fallido anterior que quedó cacheado) — no hay forma de detectarla desde JS porque el iframe es de otro origen (CORS), así que no se puede reintentar solo
- `PdfViewerModal.jsx`: nuevo botón "🔄 Reintentar" que fuerza a Google a tratar el pedido como nuevo (agrega un parámetro descartable a la URL del PDF, que Cloudinary ignora, para evitar que reuse el intento fallido) y remonta el iframe
- Nuevo botón "⬇ Abrir directo" como respaldo — abre el PDF en una pestaña del navegador si el visor sigue sin andar. En el navegador normal (Externo, Ingeniería en compu) se ve bien; en la PWA instalada en Android puede mostrar el selector "¿Con qué abrir?" (el problema que V236 evitaba), pero es preferible a quedarse sin ver el plano

### V242 — Fix: Visualizadores no dejaba asignar un Parcial que comparte código con su Completo:
- Reportado con el caso real WRAC R32/12FS/SC069 ("Salida Evaporadora", Parcial de "Pref. Salida Evaporadora") — mismo patrón ya conocido de V238 (Ciclos) y de las mediciones, pero acá nunca se había contemplado
- Causa: `subconjuntosDe()` en `GestionVisualizadores.jsx` excluía directamente del desplegable de "Subconjunto" a cualquier Parcial cuyo `codParcial` fuera igual al `codCompleto` de su padre — no había forma de elegirlo para asignarle un visualizador
- Fix: ahora se incluye con el mismo sufijo `||P` que ya usan Tiempos y Ciclos para desambiguar (`SC069||P`), etiquetado "(Parcial)" en el desplegable
- `SoldaduraDetail.jsx`: el match de "📎 Visualizador" ahora compara contra `storageKey` (que ya resuelve el `||P`) en vez del código plano — antes, con el bug de arriba ya corregido, un visualizador asignado a SC069 hubiera aparecido igual en la ficha del Completo y en la del Parcial sin distinguir cuál es cuál
- `ExternoVisualizadores.jsx` y `SoldaduraVisualizadores.jsx`: se les saca el sufijo `||P` solo para mostrar (no afecta el matching), para no mostrar el código con la barra al usuario

### V241 — Editar un visualizador ya subido (agregar/sacar subconjuntos compartidos, reemplazar el PDF):
- Pedido: hasta ahora un visualizador solo se podía crear o borrar entero — si había que sacar uno de los subconjuntos compartidos, o agregar uno nuevo después de subido, no había forma sin borrar todo y volver a cargarlo
- Nuevo botón ✏️ por fila en `GestionVisualizadores.jsx` (exclusivo Admin) que abre el mismo modal de "Nuevo visualizador" pero precargado — nombre, y cada fila de Modelo→Capacidad→Subconjunto ya asignada, reconstruyendo el `docId` de cada capacidad para que los desplegables encadenados funcionen igual que al crear
- Desde ahí se puede sacar un subconjunto compartido (❌ por fila), agregar uno nuevo ("+ Agregar otro subconjunto"), cambiar el nombre, o **reemplazar el PDF** si hace falta — el campo de archivo pasa a ser opcional en edición, y si no se elige uno nuevo se conserva la URL de Cloudinary existente
- Los avisos de duplicado de V240 (nombre de archivo repetido, subconjunto ya asignado) ahora excluyen al propio visualizador que se está editando, para no avisar de un choque contra sí mismo
- Usa `updateDoc` sobre el mismo documento en vez de crear uno nuevo — no cambia el `id` del visualizador ni requiere borrar y resubir el PDF si no se lo reemplaza

### V240 — Mejoras en Gestión de Visualizadores: filtro por Modelo/Capacidad y aviso de posibles duplicados:
- Pedido: con varios visualizadores ya cargados, la lista plana hacía difícil ubicar cuál se subió para cada modelo/capacidad, y no había forma de detectar si se subía el mismo archivo dos veces
- `GestionVisualizadores.jsx` (exclusivo Admin, sin cambios de acceso): nuevos desplegables "Modelo" / "Capacidad" arriba de la lista para filtrarla — sin filtro se ve todo igual que antes
- Aviso de duplicado por **nombre de archivo**: se guarda `archivoNombre` (nombre original del PDF) en cada visualizador; si el archivo elegido para subir coincide (sin importar mayúsculas ni extensión) con uno ya subido, aparece un aviso naranja apenas se elige el archivo, y una confirmación extra al guardar — no bloquea, permite continuar si es un reemplazo intencional (ej: el caso de V232, resubir un PDF roto)
- Aviso de duplicado por **subconjunto ya asignado**: cada fila de "Modelo → Capacidad → Subconjunto" en el formulario avisa si esa combinación ya tiene un visualizador asignado (nombre incluido), y pide confirmación extra al guardar si se continúa igual
- Ambos avisos son solo eso — avisos con confirmación, no bloqueos duros — porque re-subir con el mismo nombre o reasignar un subconjunto puede ser intencional (corregir un archivo, agregar un visualizador alternativo)

### V239 — Instrucciones de uso actualizadas (faltaban varias funciones de versiones recientes):
- El usuario preguntó si los instructivos (`Instrucciones.jsx`) estaban al día — no lo estaban: quedaron desactualizados desde V211 en adelante, documentando solo hasta las funciones de ese momento
- Panel **Admin**: agregadas Gestión de Visualizadores (V231-234), "Migrar modelo" (V220/226), borrado de Ciclos individual/masivo/por modelo+cap (V221/222), carga masiva de imágenes, edición de fotos en Avisos (V230), y sección nueva de Gestión de Operarios (V211/213/214, con detección y fusión de nombres duplicados)
- Panel **Ingeniería**: agregado el acceso de solo lectura a Visualizadores dentro de Soldadura (V234)
- Panel **Producción**: agregada fila explícita de que Visualizadores no está disponible (mismo criterio que Takt Time)
- Panel **Externo** ya estaba al día (Visualizadores y el flujo Modelos→Tuberías de V219/231 ya figuraban) — sin cambios
- Cambio puramente de documentación dentro de la app, no toca lógica ni datos

### V238 — Fix: Ciclos no distinguía un Parcial que comparte código con su Completo:
- Reportado con el caso real WRAC R32/12FS/SC069: el Excel tiene un Completo "Pref. Salida Evaporadora" (SC069) y un Parcial "Salida Evaporadora" que **comparte el mismo código** SC069 — patrón ya conocido (mismo caso que Válvula líquido SC120/SC120)
- Las mediciones (`soldadura_tiempos`) ya resolvían esto con la clave especial `${codigo}||P`, pero **Ciclos nunca lo contempló** — guardaba ambos bajo la misma clave `{docId}||SC069`, así que cargar el ciclo del Parcial pisaba (o quedaba pisado por) el del Completo, y encima React mostraba las dos filas con `key` duplicada
- Fix en `SoldaduraTaktTime.jsx` (tab Ciclos): cada ítem de la lista ahora tiene un `storageKey` propio — igual al código para casos normales, con sufijo `||P` cuando el Parcial comparte código con su Completo. Se actualizaron `handleSave`, `handleDeleteCiclo`, `handleDeleteAllCiclos`, la importación desde Excel y la key de React para usar `storageKey` en vez del código plano
- `SoldaduraDetail.jsx`: el ciclo mostrado en la ficha del subconjunto (`cicloCs`) ahora usa la misma variable `storageKey` que ya usan las mediciones, en vez del código sin desambiguar
- **Nota para el usuario**: como el Completo y el Parcial compartían la clave vieja, el valor que ya tenías cargado para SC069 quedó asociado al **Completo** ("Pref. Salida Evaporadora"). Si el ciclo que cargaste era para el Parcial ("Salida Evaporadora"), hay que volver a ingresarlo — ahora sí va a guardarse en su propia clave, sin pisar al otro

### V237 — Zoom con pellizco habilitado en el visor de PDF:
- Pedido: en el celular no se podía hacer zoom para ver detalles del plano
- Causa: `index.html` tiene `user-scalable=no, maximum-scale=1.0` en el viewport para que no se desplace la pantalla sin querer al usar el cronómetro — eso bloqueaba el pellizco (pinch-zoom) en toda la app, incluido el visor de PDF
- Fix: `PdfViewerModal.jsx` ahora habilita `user-scalable=yes, maximum-scale=5.0` en el viewport apenas se abre (con un `useEffect`), y **restaura la configuración original al cerrar** — el resto de la app sigue sin zoom accidental, solo el visor de PDF lo permite

### V236 — Fix: el visor de PDF mostraba el selector "¿Con qué abrir?" en la PWA de Android:
- Reportado: en el celular, al abrir un visualizador aparecía un cartel del sistema para elegir con qué app abrirlo, en vez de mostrarlo directo
- Causa: la PWA instalada en Android corre sobre un WebView sin lector de PDF nativo (a diferencia de Chrome, que sí lo tiene) — cargar el PDF directo en el `<iframe>` disparaba ese comportamiento
- Fix: `PdfViewerModal.jsx` ahora carga el PDF a través del visor de Google Docs (`docs.google.com/viewer?url=...&embedded=true`) — es una página web común que dibuja el PDF, no un archivo que el sistema intente abrir con otra app. Se ve igual, sin el cartel intermedio
- Requiere conexión a internet para el visor (ya la necesitaba igual para bajar el PDF de Cloudinary)

### V235 — Fotos de Avisos más rápidas: pedir versión redimensionada a Cloudinary:
- Reportado: las fotos de Avisos tardaban en cargar — se pedía siempre la foto original tal cual la sacó el celular (varios MB), tanto en la miniatura chica como en la vista ampliada
- Nuevo helper `cldResize(url, transform)` en `AvisosList.jsx`: inserta una transformación de Cloudinary en la URL (`w_...,h_...,c_fill,q_auto,f_auto`) para pedir una versión ya redimensionada y con formato optimizado (WebP/AVIF si el navegador lo soporta), sin volver a subir nada
- Miniaturas (lista y modal de edición): 160×160 / 120×120. Vista ampliada (lightbox): máximo 1200px de ancho, con calidad automática — sigue viéndose nítida pero pesa mucho menos que el original
- Solo cambia qué versión de la imagen se pide para mostrar — no toca la subida ni el archivo original guardado en Cloudinary

### V234 — Visualizadores de solo lectura para Ingeniería (dentro de Soldadura):
- Pedido: que Ingeniería (y Admin) tengan acceso a consultar los visualizadores sin gestionarlos, igual que ya tiene Externo, en vez de solo verlos subconjunto por subconjunto dentro de `SoldaduraDetail.jsx`
- Nuevo `SoldaduraVisualizadores.jsx` (`/soldadura/visualizadores`): mismo flujo de solo lectura que `ExternoVisualizadores.jsx` (Modelo → Capacidad → lista → visor incrustado), pero con el back al Home de Soldadura
- Nuevo chip "📎 Visualizadores" en `SoldaduraHome.jsx`, oculto para Producción (mismo criterio que ya usa el chip de Takt Time) — la gestión (subir/editar/borrar) sigue siendo exclusiva de Admin en `GestionVisualizadores.jsx`

### V233 — Visor de PDF incrustado en la app (no abre pestaña nueva) + autocompletar nombre:
- Pedido tras probar V232: abrir un visualizador llevaba a una pestaña nueva del navegador, sensación de "salir" de la app (más notorio en la PWA instalada)
- Nuevo `components/PdfViewerModal.jsx`: pantalla completa dentro de la misma app con un `<iframe>` y botón de cerrar (✕) — mismo patrón que el lightbox de fotos, pero a pantalla completa por el tamaño típico de un PDF
- Reemplaza los `window.open(url, '_blank')` en `SoldaduraDetail.jsx`, `ExternoVisualizadores.jsx` y `GestionVisualizadores.jsx` (botón "Ver" de Admin)
- Extra: en "Nuevo visualizador", el campo Nombre/Etiqueta ahora se autocompleta con el nombre del archivo PDF elegido (sin la extensión) — solo si el campo está vacío, así no pisa un nombre que ya hayas escrito. Se puede editar libremente después

### V232 — Fix: los PDF de Visualizadores no se podían abrir (resource_type incorrecto en Cloudinary):
- Reportado con captura: al abrir un visualizador recién subido, el visor de PDF del navegador decía "No podemos abrir este archivo"
- Causa: `GestionVisualizadores.jsx` subía el PDF con `resource_type=raw` — Cloudinary recomienda `resource_type=image` para PDFs (los soporta nativamente, habilitando su procesamiento), y `raw` quedaba mal servido con el preset sin firmar `tuberia_fotos`
- Fix: cambiado el endpoint de subida a `/image/upload` (mismo que usan las fotos)
- **Acción pendiente para el usuario**: el visualizador de prueba que ya subiste (VI-IP.241) quedó con una URL rota — hay que borrarlo desde Admin → Visualizadores y volver a subirlo

### V231 — Nuevo apartado "Visualizadores" (PDF de montaje), gestionado por Admin y visible para Soldadura/Externo:
- Nueva colección `soldadura_visualizadores`: cada doc = `{ nombre, url, public_id, targets: [{modelo, cap, codigo, desc}] }` — un mismo PDF puede aplicar a varios subconjuntos/modelos (`targets` es un array), para piezas que se repiten entre modelos
- **Admin**: pantalla nueva `GestionVisualizadores.jsx` (Inicio → 📎 Visualizadores). Permite subir un PDF, ponerle un nombre/etiqueta (ej: "VI-IP.266"), y asociarlo a uno o más Modelo→Capacidad→Subconjunto (con "+ Agregar otro subconjunto" para compartirlo). Borrar un visualizador lo saca de todos los subconjuntos donde aparecía
- **Soldadura** (Admin/Ingeniería/Producción): `SoldaduraDetail.jsx` ahora muestra una sección "📎 Visualizador" si hay un PDF asociado a ese modelo+cap+código exacto — toca y abre el PDF en pestaña nueva (visor nativo del navegador, sin descargar)
- **Externo**: nuevo tile "Visualizadores" en el Home, separado de "Modelos" — flujo propio: elegís Modelo + Capacidad y ves la lista de PDFs de esa capacidad con formato "Nombre — Descripción del subconjunto" (ej: "VI-IP.266 — Válvula líquido"), sin tener que navegar por el catálogo de subconjuntos primero
- Subida a Cloudinary con `resource_type=raw` (no `image`) para que sirva el PDF tal cual, sin intentar procesarlo como imagen
- Antes de programarlo se armó y ajustó un mockup navegable (HTML) con el usuario para validar el flujo completo (gestión + las dos formas de consultarlo)

### V230 — Editar fotos de un aviso (agregar/eliminar) desde "Editar aviso":
- El modal de edición de Avisos permitía editar título, descripción, prioridad y puesto, pero no las fotos ya subidas — si subías una foto equivocada no había forma de sacarla ni cambiarla salvo borrando el aviso entero
- Nuevo bloque "Fotos" en el modal: miniaturas de las fotos existentes con botón × para sacarlas, botón × también en las fotos nuevas elegidas (aún no subidas), y botones Cámara/Galería para agregar hasta completar el máximo de 3
- Al guardar, las fotos nuevas se suben a Cloudinary recién ahí (no antes) y el campo `fotos` del aviso se reemplaza completo con "las que quedaron conservadas + las nuevas subidas" — permite sacar todas las fotos de un aviso si hace falta
- No se tocó la lógica de "foto de cierre" (al marcar como hecho) ni la subida al crear un aviso nuevo — son flujos separados que ya funcionaban bien

### V229 — Manejo visible de fotos rotas en Avisos:
- Reportado tras V228: además del problema de apertura (ya resuelto), la miniatura en sí mostraba el ícono roto nativo del navegador cuando la imagen no cargaba — probablemente por una subida cortada a medias en su momento (mala conexión), no algo que la app pueda controlar en la carga
- `AvisoCard` ahora atrapa el evento `onError` de cada miniatura y muestra un aviso propio ("🖼️ No se pudo cargar · tocá para reintentar") en vez del ícono feo del navegador — tocar reintenta cargar la imagen
- No cambia dónde ni cómo se suben las fotos (`uploadToCloudinary`, Cloudinary) — solo cómo se informa cuando una imagen puntual no carga

### V228 — Fix: fotos de Avisos se descargaban en vez de previsualizarse:
- `AvisosList.jsx` abría las fotos con `window.open(f.url, '_blank')` — a diferencia de Soldadura/Tuberías, que usan un visor propio (lightbox) dentro de la app. En la PWA instalada eso se comportaba como descarga en vez de mostrar la imagen
- Fix: mismo patrón de lightbox que ya usa `PhotoGrid.jsx` (`modal-overlay img-modal` + `full-img`, ya definidos en `index.css`) — ahora tocar una foto de un aviso la abre en un visor dentro de la app, con botón de cerrar, igual que en el resto de la app
- No se tocó la subida ni el guardado de fotos de avisos (`uploadToCloudinary`, campo `fotos` en Firestore) — solo cómo se visualizan al tocarlas

### V227 — Fix: Balance nunca contaba las mediciones de un Parcial medido aparte:
- Reportado con el caso "Auxiliar Capilar" (SC153, Parcial de "Tubo Capilar" SC152 en WRAC R32): aunque el catálogo ya lo tenía bien cargado (Tipo=Parcial corregido en el Excel), seguía sin aparecer en Balance
- Causa: `computeBalance()` en `SoldaduraBalance.jsx` solo miraba `tiempos[codCompleto]` de cada subconjunto — nunca revisaba las mediciones de sus `parciales`. Un Parcial armado en un puesto distinto al de su Completo (caso típico: "Auxiliar Capilar" en otro puesto que "Tubo Capilar") quedaba invisible para el cálculo de carga y redistribución
- Fix: `computeBalance()` ahora también agrega una entrada a `subcData` por cada Parcial que tenga mediciones propias bajo su propio código (`codParcial`), sin duplicar cuando el Parcial comparte código con su Completo (caso ya cubierto, ej: Válvula líquido SC120/SC120)
- Es aditivo: si nunca mediste un Parcial por separado, no cambia nada — solo suma tareas nuevas donde antes no había ninguna

### V226 — Fix: "Migrar modelo" (V220) no movía Takt Time ni Ciclos, rompiendo el Balance:
- Reportado con captura: en Balance ya no aparecía la sección de redistribución para WRAC R32 — solo "CARGA POR PUESTO" a secas, sin línea de Takt arriba
- Causa raíz: la herramienta "🔀 Migrar modelo" (V220) solo movía `soldadura_tiempos` y borraba el modelo viejo de `soldadura_modelos` — nunca migró `config/takt_soldadura` ni `config/ciclos_soldadura`, que usan claves `{modeloId}||{linea o código}`. Al renombrar `WRAC 2025 → WRAC R32`, el Takt Time quedó huérfano bajo la clave vieja (`WRAC 2025_12FS||ODU2`) y el nuevo modelo no tiene Takt cargado → `taktCs = 0` → sin ese valor, `computeBalance()` no calcula redistribución
- Fix: `migrarModelo()` ahora también migra Takt Time y Ciclos (remapea la clave completa, no solo el ID), y ya no depende de que el modelo viejo siga existiendo en el catálogo — escanea las claves directamente, así también sirve para reparar casos ya migrados a medias como este
- El campo "Modelo viejo" del modal pasó de desplegable a texto libre, porque un modelo ya migrado desaparece del catálogo y no aparecería en la lista
- **Acción pendiente para el usuario**: volver a correr "Migrar modelo" con `WRAC 2025 → WRAC R32` (y revisar si `AG Fijo R32`/`Portatil 2025` tenían Takt Time cargado, por si les pasó lo mismo) — esta vez sí va a mover el Takt Time que quedó atrás

### V225 — Fix real de la pantalla en blanco/error en Carga de Imágenes: `modelos` faltante en un match:
- El `ErrorBoundary` de V224 hizo su trabajo: en vez de pantalla en blanco, mostró "Algo salió mal" — eso confirmó que el problema no era memoria, era un bug de código real
- En `findMatchLocal()` (`TuberiasCargaImagenes.jsx`), la rama que matchea un archivo **por plano Y código a la vez** (el caso más común, ej: `00190-15122000027906.PNG`, justo el formato que la pantalla recomienda usar) devolvía el resultado **sin el campo `modelos`**. Al renderizar la vista previa, `item.match.modelos.length` explotaba porque `modelos` era `undefined`
- Fix: esa rama ahora arma `modelos` igual que las demás (`tryDocs`). Además se blindó el render con `item.match.modelos?.length || 0` por si aparece otro caso similar a futuro
- Explica el bug original reportado como "pantalla en blanco" — no era memoria ni el problema de hooks de V223 (ese también era real, pero este es el que más se repetía porque afecta a archivos bien nombrados)

### V224 — Fix: memoria al cargar 400 imágenes + red de seguridad ante errores:
- Reportado tras el fix de V223: con cargas masivas grandes (caso real: 400 imágenes, ~37MB) la pantalla se colgaba en blanco justo al llegar al 100% de la subida — no era el bug de hooks, sino memoria del navegador
- Causa: `TuberiasCargaImagenes.jsx` mantenía las 400 vistas previas (`URL.createObjectURL`, imágenes decodificadas) vivas en memoria durante toda la subida, aunque la pantalla de "Subiendo..." no las muestra. Sumado a las 400 subidas a Cloudinary y escrituras a Firestore en simultáneo, saturaba la pestaña
- Fix: `handleSave()` ahora libera (`URL.revokeObjectURL`) todas las vistas previas apenas arranca la subida, antes de empezar los lotes de upload — ya no hace falta mantenerlas en memoria a partir de ese punto
- Además, nuevo `components/ErrorBoundary.jsx` (componente de clase, es la única forma de atrapar errores de render en React) envolviendo toda la app en `App.jsx`: cualquier error de render futuro va a mostrar un aviso con botón "Volver al inicio" en vez de dejar la pantalla en blanco sin explicación. No soluciona un crash de memoria del navegador (eso mata la pestaña a nivel sistema, ningún JS lo puede atrapar), pero sí cualquier error de código real

### V223 — Fix: pantalla en blanco al cargar imágenes (violación de Reglas de Hooks):
- `TuberiasCargaImagenes.jsx` y `SoldaduraCargaImagenes.jsx` hacían `if (!isAdmin) { navigate(...); return null }` **antes** de declarar sus `useState`/`useRef` — si `isAdmin` cambiaba de valor durante la sesión (ej: se pierde el `sessionStorage` en segundo plano de un navegador mobile), React llamaba un número distinto de hooks entre renders y tiraba un error fatal sin pantalla de respaldo, dejando la app en blanco
- Reportado por el usuario con captura: pantalla blanca en `/tuberias/imagenes` mientras cargaba imágenes
- Fix: mismo patrón ya usado en `GestionUsuarios.jsx`/`GestionOperarios.jsx` — todos los hooks se declaran primero, sin excepciones, y la redirección de "no admin" se mueve a un `useEffect` separado con el `return null` recién al final, después de todos los hooks

### V222 — Eliminar modelo+capacidad completo desde Ciclos (Admin):
- Pedido distinto al de borrar ciclos puntuales (V221): acá se borra el modelo+capacidad entero, no solo los tiempos de ciclo
- Botón 🗑 junto a los desplegables de Modelo/Cap en Soldadura → Takt Time → Ciclos (solo Admin, solo si hay un modelo+cap seleccionado)
- Al confirmar, borra en un solo paso: el doc de `soldadura_modelos` (catálogo), el doc de `soldadura_tiempos` (mediciones y fotos), las claves de `config/ciclos_soldadura` y de `config/takt_soldadura` que empiecen con ese `docId||` — todo lo asociado a ese modelo+capacidad puntual, sin afectar otros modelos
- Pensado para sacar de encima capacidades mal cargadas o de prueba sin tener que migrar nada (a diferencia de "Migrar modelo" de V220, acá no hay destino — se borra directo)

### V221 — Opción para borrar ciclos duplicados/mal importados (Admin):
- En Soldadura → Takt Time → tab Ciclos: al reimportar una planilla de tiempos los valores quedaban duplicados/incorrectos sin forma de sacarlos desde la app
- Botón 🗑 por fila (solo si hay un valor guardado) para borrar un ciclo puntual
- Botón "🗑 Borrar ciclos de esta cap." junto al de importar, para limpiar de una todos los ciclos guardados del modelo+capacidad seleccionado
- Ambos usan `deleteField()` sobre el doc `config/ciclos_soldadura` — no tocan `soldadura_tiempos` (mediciones reales) ni Takt Time, solo los valores de ciclo ya guardados. Visible únicamente para Admin

### V220 — Herramienta "Migrar modelo renombrado" en Soldadura (Admin):
- Cuando un modelo cambia de nombre en el Excel (ej: "AG Fijo R32" → "Fijo AG R32" para que matchee con el modelo de Tuberías), el Excel-import de `SoldaduraHome.jsx` crea un modelo nuevo pero no borra el viejo — como las mediciones de tiempo (`soldadura_tiempos`) se guardan bajo el ID `{modelo}_{cap}`, quedaban huérfanas bajo el nombre viejo y no aparecían en el modelo corregido (ni en Balance, Takt Time o exportación de Tiempos, que leen por ese mismo ID)
- Nuevo chip "🔀 Migrar modelo" en `SoldaduraHome.jsx` (solo Admin): dos desplegables (modelo viejo / modelo nuevo) alimentados con los modelos ya cargados, confirmación antes de ejecutar
- Al migrar: por cada capacidad del modelo viejo, copia el documento completo de `soldadura_tiempos` (mediciones, fotos, supervisor, valoración — todo tal cual) al ID del modelo nuevo, borra el documento viejo, y borra la entrada vieja de `soldadura_modelos`
- No es específico de los 3 modelos que motivaron el pedido (AG Fijo R32, Portatil 2025, WRAC 2025) — queda como herramienta reutilizable para la próxima vez que un modelo cambie de nombre

### V219 — Flujo "Modelos" para el perfil Externo: Soldadura → Tuberías, sin tiempos:
- El tile "Modelos" del Home de Externo ya no abre `/tuberias` (catálogo de Tuberías) — ahora abre `/externo/modelos`, un flujo nuevo y de solo lectura que recorre Soldadura y termina en las piezas de Tuberías del mismo subconjunto
- Flujo: `ExternoModelos` (modelos de Soldadura) → `ExternoCapacidades` (capacidades) → `ExternoSubconjuntos` (subconjuntos Completo) → `ExternoSubconjuntoDetail` (info + foto del subconjunto, sub-componentes si tiene, botón "Ver piezas de Tuberías") → `ExternoPiezas` (piezas de `tuberia_bd` matcheadas por `modelo`+`cap`+`codIntSubcCompleto`/`codIntSubcParcial`) → reutiliza `TuberiasPiezaDetail` ya existente para el detalle final de cada pieza
- **Nunca se muestra la sección de tiempos/mediciones en ningún paso** — no hay aviso de "no disponible", directamente no está en el render (a diferencia del mockup previo, que sí mostraba un candado informativo)
- 5 archivos nuevos en `src/pages/externo/`, ninguno modifica los componentes que usan Admin/Ingeniería/Producción (`SoldaduraDetail.jsx`, `TuberiasHome.jsx`, etc. quedan intactos)
- `Instrucciones.jsx` → `PanelExterno` actualizado: el flujo descrito ahora es Modelos (Soldadura) → Capacidad → Subconjunto → Piezas de Tuberías → Detalle, en vez del catálogo directo de Tuberías
- El match Soldadura↔Tuberías se apoya en que ambos Excels ya comparten `modelo`, `cap` y el código de subconjunto (`codCompleto`/`codIntSubcCompleto`, `codParcial`/`codIntSubcParcial`) — confirmado por el usuario, no hizo falta una colección de mapeo nueva

### V218 — Renombre de perfil "Externo Soldadura" → "Externo":
- Cambiado el string en `AuthContext.jsx` (ALL_USERNAMES, matching de roleKey), `Login.jsx` (ROLES_CON_NOMBRE), `GestionUsuarios.jsx` (ROLES, ROLE_KEYS) e `Instrucciones.jsx` (título del panel)
- El `roleKey` interno sigue siendo `'externo'` — no se tocó el esquema de `perfiles` en Firestore, solo el nombre visible con el que se loguea
- Pendiente (a definir): dar a este perfil acceso de solo lectura a Soldadura (ver subconjunto + imagen, sin tiempos/mediciones) para que desde ahí navegue a los datos de Tuberías del mismo subconjunto — Opción B discutida, todavía sin implementar

### V217 — Fix: la posición de scroll quedaba heredada al cambiar de pantalla:
- Al entrar a un subconjunto (o volver atrás) la página aparecía en la misma posición de scroll que tenía la pantalla anterior, en vez de arrancar arriba — se reportó con Tuberías (Valvula 4 Vias → su Parcial) pero afecta a cualquier navegación de la app, ya que `.content` no tiene scroll propio y es el `window` el que se desplaza
- Nuevo componente `ScrollToTop` en App.jsx (dentro de `AppRoutes`, usa `useLocation` de react-router) que hace `window.scrollTo(0, 0)` en cada cambio de ruta

### V216 — Fix: los recuadros de subconjunto no se movían al redistribuir:
- En "ESTADO FINAL POR PUESTO" la barra/tiempo ya reflejaba la redistribución simulada (simLoads), pero los recuadros de abajo seguían filtrando por el `primary` original de subcData — igual que en "ESTADO ORIGINAL". Una tarea marcada como movida de Preformado a SOL-08 seguía apareciendo solo bajo Preformado
- Había una variable `puestoTasks` que calculaba algo parecido pero nunca estaba conectada al render — código muerto de un intento anterior
- Fix: nuevo mapa `finalPrimaryByCode` (solo para mostrar, no toca `computeBalance()`) que aplica los movimientos de `suggestions` sobre `subcData`. El recuadro movido ahora muestra "↵ puesto original" en amarillo para dejar claro que se reasignó, no que se duplicó

### V215 — Confiabilidad de la muestra visible junto a los promedios (solo informativo):
- Badge de semáforo: n=1 → rojo "muestra insuficiente" · n≥2 con dispersión ≤15% → verde "estable" · n≥2 con dispersión >15% → naranja
- En SoldaduraBalance.jsx (chips de subconjunto en Balance) y en la fila resumen de puesto de SoldaduraDetail.jsx
- Confirmado que NO toca el cálculo: `contribution` sigue siendo exactamente `primary.avg` con la misma fórmula que antes (ahora dentro de `statsNorm()`, junto a n/dispersión) — loads, simLoads y sugerencias de redistribución quedan igual
- Se sacó `avgNorm()` que quedó sin uso tras el cambio

### V214 — Herramienta para unificar operarios escritos distinto:
- `fusionarNombreOperario()` en OperarioSelect.jsx recorre soldadura_tiempos y reescribe el `operario` de cada medición que coincida (sin distinguir mayúsculas) con la grafía correcta ya cargada en la lista
- Nueva tarjeta roja "Mismo operario escrito distinto" en GestionOperarios.jsx: detecta automáticamente los casos tipo "Jorge GIl" vs "Jorge Gil" (invisibles para el bloque amarillo de detección, que ya los da por cargados) y ofrece un botón "Fusionar" por variante, con confirmación (reescribe histórico, sin deshacer) y conteo de resultado
- Resuelve el pedido puntual de unificar Jorge Gil, y deja la herramienta lista para la próxima vez que aparezca otra grafía

### V213 — El desplegable de operarios ahora explica su propio estado:
- Con la lista vacía se veía igual que un control roto (se reportó como "no me deja ver el listado" cuando en realidad no había operarios cargados). Además el error de `onSnapshot` se tragaba en silencio, así que un problema de permisos se habría visto idéntico
- `useOperarios()` ahora devuelve `{ operarios, loading, error }` en vez de un array pelado, y expone/loguea los errores de lectura
- El select dice qué le pasa: "Cargando operarios…", "Todavía no hay operarios cargados" o un aviso de fallo de lectura apuntando a los permisos de `tubysol_operarios`
- Con la lista vacía el botón pasa a ser sólido y dice "+ Nuevo", con una ayuda que apunta a Inicio → Operarios

### V212 — Limpieza de pantallas muertas (`SoldaduraMedir.jsx`, `TuberiasDetail.jsx`):
- `SoldaduraMedir.jsx`: cronómetro a pantalla completa por puesto de V192. Desde V196 (cronómetro desplegable inline) ninguna pantalla navegaba ahí, pero la ruta seguía registrada y la URL respondía. Había quedado congelado en V192: sin `supervisor` ni restricción de valoración para Producción (V203), sin wake lock (V207), sin OperarioSelect (V211) — entrar por esa URL saltaba la restricción de permisos y guardaba mediciones con Supervisor vacío. Se eliminó también su ruta; el catch-all manda las URLs viejas al inicio.
- `TuberiasDetail.jsx`: flujo viejo de tuberías, nunca ruteado en el App.jsx actual. Escribía en otro documento y con otra forma (`tuberia_tiempos/{modeloId}` como `{plano:{maquina:...}}`) que el actual TuberiasCronometro (`tuberia_tiempos/{plano}` como `{puesto:...}`).
- `components/Timer.jsx`: TuberiasDetail era el único consumidor del componente `<Timer>`, así que se eliminó el componente. El archivo y su ruta quedan por el helper `fmt`, que SoldaduraTiempos y TuberiasTiempos siguen importando sin cambios.
- Borrar código no toca ningún dato de Firestore. El bundle bajó ~10 kB.

### V211 — Operarios como lista gestionada en vez de campo de texto libre:
- El campo operario era texto libre, así que la misma persona quedaba guardada con distintas grafías (en el PDF exportado aparecían "Jorge Gil" / "Jorge GIl" y "Cristian bahamonde" como si fueran distintos) — eso rompería cualquier promedio o comparación por operario a futuro
- Nueva colección `tubysol_operarios` + `components/OperarioSelect.jsx`: desplegable alimentado por Firestore con botón "+" para dar de alta sin salir del cronómetro. Si el nombre ya existe (en cualquier combinación de mayúsculas) selecciona el existente en vez de duplicar
- Nueva pantalla admin `/admin/operarios` (GestionOperarios.jsx) para agregar/eliminar, accesible desde Home
- Esa pantalla además escanea las mediciones ya guardadas y ofrece los nombres detectados como chips de un toque, para sembrar la lista con datos reales salteando las variantes mal escritas
- Eliminar un operario solo lo saca del desplegable; las mediciones ya tomadas conservan el nombre guardado

Nota: `SoldaduraDetail.jsx` es la única pantalla con campo operario (ver "Decisiones de diseño" arriba).

Nota: si se detectan más pérdidas de funcionalidad tras futuros refactors, comparar contra commit `573b1b0` (V182, última versión con el diseño PuestoTimer completo por puesto).

## Convención de versiones

Incrementar el número de versión (V###) en cada commit significativo.
Siguiente versión a usar: **V316**.
