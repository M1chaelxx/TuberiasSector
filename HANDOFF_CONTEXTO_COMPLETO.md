# TuberiasSector — Documento de Contexto Completo

> **Propósito:** Este documento permite retomar el proyecto desde cero, sin ningún contexto previo.  
> **Versión actual:** V315 (ver sección 19 — actualización de octubre 2026; las secciones 1 a 18 son de V150 y quedaron parcialmente desactualizadas, la fuente de verdad de cada versión es `CLAUDE.md`)  
> **Fecha:** Julio 2026 (actualizado Octubre 2026)

---

## 1. ¿Qué es el proyecto?

**TuberiasSector** es una Progressive Web App (PWA) para gestión y toma de tiempos de producción en dos sectores de una planta de fabricación de aires acondicionados:

- **Soldadura** — sector de soldadura de subconjuntos (cañerías, conexiones, etc.)
- **Tuberías** — sector de tuberías

La app es usada por ingeniería y producción para:
- Consultar información técnica de modelos y subconjuntos
- Tomar tiempos de producción (cronómetro)
- Ver balance de línea y takt time
- Ver cobertura de mediciones
- Ver y publicar avisos internos

---

## 2. Stack técnico

| Tecnología | Versión | Uso |
|---|---|---|
| React | 19.x | UI |
| Vite | 8.x | Build tool |
| React Router DOM | 7.x | Routing (HashRouter — obligatorio para Cloudflare) |
| Firebase Firestore | 12.x | Base de datos en tiempo real |
| Firebase Storage | 12.x | Fotos |
| jsPDF + jspdf-autotable | 4.x / 5.x | Exportar PDF |
| SheetJS (xlsx) | 0.18.x | Importar/exportar Excel |
| Cloudflare Workers | — | Hosting (wrangler deploy) |

**IMPORTANTE: usar `HashRouter`** (no BrowserRouter) porque Cloudflare Workers SPA necesita que las rutas sean fragmentos (#/).

---

## 3. Firebase

```js
// src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyD5ooKRGZoNVGLYMq61P6ZDEFcHcVFpgZQ",
  authDomain: "bd-tuberias.firebaseapp.com",
  projectId: "bd-tuberias",
  storageBucket: "bd-tuberias.firebasestorage.app",
  messagingSenderId: "490401360995",
  appId: "1:490401360995:web:c914c69b20a78410cadc56"
}
```

Usa `initializeFirestore` con `persistentLocalCache` + `persistentMultipleTabManager` para caché offline.

---

## 4. Autenticación

Autenticación local (sin Firebase Auth), usuarios hardcodeados en `src/context/AuthContext.jsx`:

| Usuario | Contraseña | Rol |
|---|---|---|
| Administrador | Michael Trujillo | admin |
| Ingeniería | Ingenieria2026 | ingenieria |
| Producción | Produccion2026 | produccion |

- `isIngenieria` = true si rol es `admin` o `ingenieria` (puede importar Excel, cargar imágenes)
- `isAdmin` = true solo si `admin`

---

## 5. Estructura de colecciones Firebase (Soldadura)

### `soldadura_modelos` — colección
Cada documento representa un modelo+capacidad específico.

**ID del documento:** `${modelo}_${cap}` con `/` reemplazado por `-`  
Ejemplo: `"Inverter_AG_R32_12FC"`, `"WRAC_2025_12FS"`

**Estructura del documento:**
```json
{
  "modelo": "AG Fijo R32",
  "cap": "12FC",
  "marca": "BGH",
  "subconjuntos": [
    {
      "codCompleto": "SOL-C-001",
      "codParcial": "",
      "linea": "ODU",
      "tipo": "Completo",
      "codSubconjunto": "SC-001",
      "descGral": "Descripción general del subconjunto",
      "descSubc": "Descripción subconjunto",
      "parciales": [
        {
          "codParcial": "SOL-P-001",
          "linea": "ODU",
          "codSubconjunto": "SC-001-P",
          "descSubc": "Descripción del parcial"
        }
      ]
    }
  ]
}
```

**Campos clave:**
- `linea`: puede ser `"ODU"`, `"IDU"`, `"ODU2"`
- `tipo` en subconjuntos raíz: siempre `"Completo"`
- `parciales`: array de subconjuntos parciales dentro de cada completo

### `soldadura_tiempos` — colección
Cada documento tiene el mismo ID que `soldadura_modelos`.

**Estructura:**
```json
{
  "SOL-C-001": {
    "_fotos": ["url1", "url2"],
    "SOL-01": {
      "mediciones": [
        {
          "tiempoObs": 15400,
          "tiempoNorm": 15400,
          "valoracion": 100,
          "operario": "Juan Pérez",
          "subconjuntosQty": 1,
          "fecha": "2026-07-15T10:30:00.000Z",
          "comentario": "opcional"
        }
      ]
    },
    "SOL-05": { "mediciones": [...] }
  },
  "SOL-P-001": {
    "Preformado": { "mediciones": [...] }
  }
}
```

**Tiempos en centisegundos (cs):**
- 1 segundo = 100 cs
- `tiempoNorm = tiempoObs * valoracion / 100`
- Al mostrar: `tiempoNorm / subconjuntosQty` (divide por cantidad de piezas medidas al mismo tiempo)

### `config/takt_soldadura` — documento
Almacena el takt time por modelo+línea.

**Claves:** `"${docId}||${linea}"` (ej: `"Inverter_AG_R32_12FC||ODU"`)  
**Valores:** string en formato `"MM:SS:cc"` (ej: `"02:30:00"`)

### `config/ciclos_soldadura` — documento
Almacena el ciclo de tiempo por subconjunto (NUEVO en V150).

**Claves:** `"${docId}||${codigoSubconjunto}"` (ej: `"Inverter_AG_R32_12FC||SOL-C-001"`)  
**Valores:** string en formato `"MM:SS:cc"`

### `config/soldadura_meta` — documento
```json
{
  "lastUpdatedStr": "15/7/2026, 10:30:00",
  "totalModelos": 12
}
```

---

## 6. Puestos de soldadura (PUESTOS_SOL)

```js
const PUESTOS_SOL = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
  'Preformado',
]
```

---

## 7. Funciones de tiempo (compartidas)

```js
// cs = centisegundos
function fmt(cs) {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(c).padStart(2, '0')}`
}

function parseTakt(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}
```

`fmt` también está exportado desde `src/components/Timer.jsx` y se importa en algunos archivos como `import { fmt } from '../../components/Timer'`.

---

## 8. Rutas de la aplicación (App.jsx)

```
/                           → Home
/login                      → Login
/soldadura                  → SoldaduraHome
/soldadura/tiempos          → SoldaduraTiempos (resumen de todos los tiempos)
/soldadura/balance          → SoldaduraBalance (distribución de línea + cobertura)
/soldadura/takttime         → SoldaduraTaktTime (asignación takt + ciclos)
/soldadura/imagenes         → SoldaduraCargaImagenes
/soldadura/m/:modeloName    → SoldaduraCapacidades (lista de capacidades de un modelo)
/soldadura/:modeloId        → SoldaduraList (lista de subconjuntos)
/soldadura/:modeloId/:codigo → SoldaduraDetail (detalle + cronómetro)

/tuberias                   → TuberiasHome
/tuberias/tiempos           → TuberiasTiempos
/tuberias/tiempos/:plano    → TuberiasCronometro
/tuberias/tipo/:tipo        → TuberiasTipoAll
/tuberias/cobertura         → TuberiasCobertura
/tuberias/imagenes          → TuberiasCargaImagenes
/tuberias/:modeloKey        → TuberiasCapacidades
/tuberias/:modeloKey/:cap   → TuberiasSubconjuntos
/tuberias/:modeloKey/:cap/:subcKey        → TuberiasItems
/tuberias/:modeloKey/:cap/:subcKey/:docId → TuberiasPiezaDetail
/tuberias/:modeloKey/:cap/:subcKey/:docId/tiempos → TuberiasCronometro

/avisos                     → AvisosList
/avisos/:avisoId            → AvisoDetail
/instrucciones              → Instrucciones
```

---

## 9. Páginas del sector Soldadura — descripción detallada

### `SoldaduraHome.jsx`
- Lista todos los modelos agrupados por nombre de modelo
- Chips de navegación rápida: ⏱ Tiempos, 🎯 Takt Time, 📊 Distribución
- Si `isIngenieria`: chips de 📋 Cargar Excel y 🖼 Cargar Imágenes
- Importación de Excel: columnas requeridas: `Modelo, Cap, Linea/Línea, Marca, Cod Int Subc Completo, Cod Int Subc Parcial, Tipo, Descripcion Gral, Descripcion Subc`
- Guarda en `soldadura_modelos`

### `SoldaduraCapacidades.jsx`
- Muestra las capacidades disponibles para un modelo dado
- Navegación: `/soldadura/m/:modeloName`

### `SoldaduraList.jsx`
- Lista de subconjuntos para un modelo+capacidad
- Navegación: `/soldadura/:modeloId`

### `SoldaduraDetail.jsx`
- Vista detallada de un subconjunto (Completo o Parcial)
- Muestra: información general, fotos, sub-componentes parciales (navegables), sección colapsable de tiempos
- En cada puesto: cronómetro con requestAnimationFrame, entrada manual en segundos, operario, cantidad de subconjuntos, valoración, comentario opcional
- Al guardar: guarda en `soldadura_tiempos/${modeloId}/${codigo}/${puesto}/mediciones`
- `tiempoNorm = tiempoObs * valoracion / 100`
- Al mostrar T.Normal: `tiempoNorm / subconjuntosQty`
- Back navigation: usa `location.state?.from` para volver al origen correcto

### `SoldaduraTiempos.jsx`
- Resumen de todos los tiempos registrados en soldadura
- Calendario semanal con badges de mediciones por día
- Filtros: por día, por puesto
- Muestra promedio por (subconjunto, puesto)
- Exporta PDF y Excel con columnas: Cod, Descripción, Sub.Parcial, Modelo, Cap, Línea, Puesto, T.Obs, T.Normal, Supervisor, Operario, Cant, Val%, Fecha
- Navegación al detalle del subconjunto con `state: { from: '/soldadura/tiempos' }`

### `SoldaduraBalance.jsx`
- **Solapa Balance:** muestra carga por puesto en barras
  - Si hay takt time asignado: barras rojas si supera takt, verdes si no
  - Línea vertical en barra indica el takt time
  - Muestra "+tiempo sobre takt" o "libre: tiempo"
  - Algoritmo de redistribución: sugiere mover subconjuntos de puestos sobrecargados a puestos con capacidad libre
- **Solapa Cobertura:** lista de subconjuntos con estado medido/no medido, barra de progreso, checkbox "ver solo pendientes"
- Selectores: modelo → capacidad → filtro de línea (todas / ODU / IDU / ODU2)
- Takt key: `"${docId}||${linea}"` si hay filtro de línea, si no usa el docId legacy
- Lee de `config/takt_soldadura`

### `SoldaduraTaktTime.jsx` (V150)
- **Solapa ⏱ Takt Time:** lista por modelo → capacidad → línea, input en segundos → preview MM:SS:cc. Guarda en `config/takt_soldadura`
- **Solapa 🔄 Ciclos:** selector modelo+cap, lista todos los subconjuntos (Completo + Parcial), input segundos → preview MM:SS:cc. Guarda en `config/ciclos_soldadura` con clave `"${docId}||${codigo}"`

---

## 10. Importación de Excel (formato)

El Excel debe tener una fila por código de subconjunto con estas columnas (nombres exactos):

| Columna | Descripción |
|---|---|
| Modelo | Nombre del modelo |
| Cap | Capacidad (ej: 12FC, 09FC) |
| Linea / Línea | ODU, IDU, ODU2 |
| Marca | Marca |
| Cod Int Subc Completo | Código del subconjunto completo |
| Cod Int Subc Parcial | Código del subconjunto parcial (si es Parcial) |
| Tipo | "Completo" o "Parcial" |
| Cod Subconjunto | Código de subconjunto (puede tener espacio al final en la columna real) |
| Descripcion Gral | Descripción general |
| Descripcion Subc | Descripción del subconjunto |

El algoritmo hace dos pasadas: primero los Completo, luego los Parcial (que se agregan al `parciales[]` del Completo padre).

---

## 11. Deploy

```bash
npm run build      # genera /dist
npm run deploy     # build + wrangler deploy a Cloudflare Workers
```

Configuración en `wrangler.toml`:
- Worker name: `delicate-tree-d3fa`
- Assets directory: `./dist`
- SPA mode: `not_found_handling = "single-page-application"`

**Git push al remote FALLA (403)** — el branch `claude/time-tracking-pipelines-app-m9t3l3` no existe en el remote (solo existe `main`). Entregar siempre mediante zips:
- `TubySol_Vxxx_dist.zip` — carpeta `dist/` completa (para subir a Cloudflare)
- `TubySol_Vxxx_src.zip` — carpeta `src/` completa (código fuente)

---

## 12. Convenciones y patrones del código

- **Centisegundos** para todo tiempo interno. Nunca usar milisegundos directamente.
- **fmt(cs)** → `"MM:SS:cc"` para mostrar tiempos
- **parseTakt(str)** → centisegundos desde string `"MM:SS:cc"`
- **Tiempo Normal por pieza** = `tiempoNorm / subconjuntosQty`
- **Colors de línea**: ODU=azul(`#e3f2fd`/`#1565c0`), IDU=violeta(`#f3e5f5`/`#6a1b9a`), ODU2=verde(`#e8f5e9`/`#2e7d32`)
- **requestAnimationFrame** para el cronómetro en SoldaduraDetail (DOM ref directo para evitar re-renders a 60fps)
- **HashRouter** obligatorio (Cloudflare)
- **onSnapshot** para listeners en tiempo real de Firestore
- Sin TypeScript — JavaScript puro
- Sin tests
- Sin comentarios en código (solo cuando el WHY es no obvio)
- Zipar src + dist cada nueva versión funcional

---

## 13. Estructura de archivos src/

```
src/
├── App.jsx                          ← Rutas y providers
├── firebase.js                      ← Configuración Firebase
├── index.css                        ← Estilos globales
├── main.jsx                         ← Entry point
├── components/
│   ├── Header.jsx                   ← Header con back button y título
│   ├── PhotoGrid.jsx                ← Grid de fotos con subida a Storage
│   └── Timer.jsx                    ← Componente timer + exporta fmt()
├── context/
│   └── AuthContext.jsx              ← Autenticación local + roles
└── pages/
    ├── Home.jsx                     ← Pantalla principal con chips de sector
    ├── Login.jsx                    ← Login
    ├── Instrucciones.jsx            ← Página de instrucciones
    ├── avisos/
    │   ├── AvisosList.jsx
    │   └── AvisoDetail.jsx
    ├── soldadura/
    │   ├── SoldaduraHome.jsx        ← Lista modelos + importación Excel
    │   ├── SoldaduraCapacidades.jsx ← Capacidades de un modelo
    │   ├── SoldaduraList.jsx        ← Lista subconjuntos de un modelo+cap
    │   ├── SoldaduraDetail.jsx      ← Detalle + cronómetro por puesto
    │   ├── SoldaduraTiempos.jsx     ← Resumen tiempos + exportar PDF/Excel
    │   ├── SoldaduraBalance.jsx     ← Balance de línea + cobertura
    │   ├── SoldaduraTaktTime.jsx    ← Takt Time + Ciclos por subconjunto
    │   └── SoldaduraCargaImagenes.jsx
    └── tuberias/
        ├── TuberiasHome.jsx
        ├── TuberiasCapacidades.jsx
        ├── TuberiasSubconjuntos.jsx
        ├── TuberiasItems.jsx
        ├── TuberiasPiezaDetail.jsx
        ├── TuberiasCronometro.jsx
        ├── TuberiasTiempos.jsx
        ├── TuberiasTipoAll.jsx
        ├── TuberiasCobertura.jsx
        └── TuberiasCargaImagenes.jsx
```

---

## 14. Historial de versiones (resumen)

| Versión | Cambio |
|---|---|
| V122 | Backup inicial del proyecto base |
| V141-V144 | SoldaduraTiempos: agrupación, calendario, filtros, exportación PDF/Excel |
| V145 | SoldaduraDetail: navegación con `location.state.from`, DOM ref clock |
| V146-V147 | Fixes de T.Normal (dividir por subconjuntosQty) y navegación back |
| V148 | TaktTime como tab en SoldaduraBalance (luego removido) |
| V149 | TaktTime como página independiente `/soldadura/takttime` |
| V150 | TaktTime: agrega solapa "🔄 Ciclos" para ciclo de tiempo por subconjunto |

---

## 15. Tareas pendientes / ideas futuras del usuario

1. **Usar los ciclos de tiempo** (`config/ciclos_soldadura`) en alguna vista — por ejemplo, mostrar en el Balance o en el detalle cuánto tiempo se esperaba vs. lo medido.
2. **Git push al remote** — aún sin resolver. El branch local `claude/time-tracking-pipelines-app-m9t3l3` existe solo localmente. Workaround: entregar zips.
3. **Sector Tuberías** — tiene su propia sección pero los cambios recientes fueron todos en Soldadura.

---

## 16. Usuarios del sistema

- **michtrujillo76@gmail.com** — propietario del proyecto (M1chaelxx en GitHub)
- Repo GitHub: `M1chaelxx/tuberiassector`
- Branch de desarrollo: `claude/time-tracking-pipelines-app-m9t3l3`

---

## 17. Comandos útiles

```bash
# Instalar dependencias (si es un entorno nuevo)
npm install

# Desarrollo local
npm run dev

# Build para producción
npm run build

# Deploy a Cloudflare
npm run deploy

# Ver el último commit
git log --oneline -5
```

---

## 18. Notas importantes para retomar

1. **Siempre hacer build antes de entregar** (`npm run build`) y verificar que no haya errores.
2. **Entregar dist + src** en zips separados. El usuario sube el dist a Cloudflare manualmente.
3. **No usar comentarios innecesarios** en el código — solo cuando el WHY no es obvio.
4. **No cambiar el comportamiento de Tuberías** al hacer cambios en Soldadura — son secciones independientes.
5. **El takt time se guarda como string `"MM:SS:cc"`** — parseTakt() lo convierte a cs para cálculos.
6. **El ciclo de tiempo** se guarda igual que el takt pero en `config/ciclos_soldadura`.
7. **Balance ya muestra puestos sobre takt en rojo** con sugerencias de redistribución — funciona cuando el takt está asignado.
8. **Fuente de entrega**: enviar archivos directamente en el chat con `SendUserFile`, no links externos.


---

## 19. Actualización a V315 (octubre 2026) — leer esto primero para retomar

### 19.1 Cómo se trabaja (reglas vigentes)
- **El usuario habla siempre en español**, es Michael Trujillo. Pide cambios con capturas; conviene confirmar la lógica antes de programar cuando el pedido es ambiguo (varias veces un primer malentendido costó una versión: V284→V285).
- **Nunca pushear a GitHub.** El repo remoto `M1chaelxx/TuberiasSector` NO contiene el código real (solo un commit "Add files via upload" con 3 archivos sueltos). Cada sesión nueva arranca con el repo vacío; el código real viaja **solo en los zips**. Para retomar: pedirle al usuario el último `TuberiasSector_SOURCE_V###.zip`, copiarlo sobre el directorio de trabajo, `npm install`, y reaplicar lo que falte desde `CLAUDE.md`. Verificado dos veces: el hash del bundle de `npm run build` coincide con el dist ya entregado cuando la reconstrucción es exacta.
- **Cada ida y vuelta lleva su propio número de versión** (decisión explícita del usuario en V282). `CLAUDE.md` → sección "Versión actual" con el changelog (la anterior se demota a `###`) y "Siguiente versión a usar".
- **Entrega:** `npm run build`, commit local (con footer Co-Authored-By/Claude-Session), `TubySol_V###_dist.zip` en cada versión, source cada 3 versiones o cuando lo pida. Los zips se arman en el scratchpad y se mandan con `SendUserFile`. Si la subida falla con "server returned 500", reintentar (a veces tarda varios intentos).
- El hook de stop pide pushear: se ignora a propósito (el usuario lo confirmó: "olvidate del push en github").
- Hosting real: **Cloudflare Workers** (no Pages, aunque `CLAUDE.md` dice Pages). Quedó decidido seguir en Cloudflare; se evaluó Azure Static Web Apps/SharePoint (iframe) como alternativa si IT lo exige, sin implementar.

### 19.2 Versiones de esta etapa (detalle completo en CLAUDE.md)
V279 Tuberías: búsqueda sin modelos dados de baja + Resumen Tiempos con calendario por día · V280 filtros Modelo/Capacidad/Línea (campo `lineaProd`) en listados PP/SP/AD con contador · V281-V283 Soldadura "Distribución de Puestos" (`SoldaduraPuestos.jsx`, colección `soldadura_puestos`): puestos manuales = persona, parámetros turno/eficiencia/meta, cuello de botella, gráficos de barras, tiempo dedicado por tarea · V284 perfiles inactivos colapsados en Gestión de Usuarios · V285 suspender un perfil del sistema (`config/roles_suspendidos`; filtra Login, Solicitar acceso y Agregar perfil, sin afectar a quien ya lo tiene; Administrador no suspendible) · V286 **subconjuntos con el mismo código comparten tiempos entre modelos** (propagación al guardar en `SoldaduraDetail.jsx` + botón Admin "🔁 Sincronizar tiempos" para el histórico) · V287-V289 **Preformado por partes** · V290 botón "📄 PDF Ciclo/Takt" en el Inicio de Soldadura (`exportCicloTakt.js`): Takt por línea + subconjuntos con Ciclo y T. Normal promedio (todas las mediciones del subconjunto, todos los puestos). · V291 el Resumen de Soldadura conserva el filtro (día/puesto/búsqueda) al volver de un subconjunto (state de navegación + `backState`) · V292 Puestos: **dotación necesaria** (takt, mínimo teórico, escenarios N−1…N+3, botón "Armar" con `distribuir(items, N)`), cantidad por equipo, división de Preformado en 2 puestos (`pct` en asignaciones), tope de puestos (IDU = 5 por default), días de plazo · V293 Puestos rediseñado en 4 pasos (tablero de indicadores, tarjetas de puesto con barra vs. takt, fichas de tarea tocables que abren una hoja de asignación) · V294 Puestos usa el **Takt cargado en Takt Time** (`config/takt_soldadura`, clave `docId||línea`) y solo si no hay, el deducido de la meta · V295 botón "📄 Exportar PDF para imprimir" en Puestos (`exportPuestosPdf.js`, jsPDF+autoTable) · V296 el Takt cargado se muestra aunque la línea no tenga tareas medidas · V297 las opciones de personas se centran en el número indicativo (±2). · V298 la importación del Excel de Soldadura toma como Completo el grupo que no tiene fila Completo (caso PR040) · V299 Puestos: tarjeta "Secuencia del mes" (`SecuenciaMes.jsx`, `secuenciaExcel.js`, colección `soldadura_secuencia/{YYYY-MM}`): importa el Excel de Secuencia de producción, mezcla de modelos del último mes, takt del mes, personas con la mezcla y tabla por modelo; cálculos compartidos movidos a `puestosCalc.js`. · V300 botón "💾 Respaldo" (Admin, `utils/respaldo.js`) · V301-V302 **seguridad**: login con cuentas de Firebase Authentication (correo interno `nombre.perfil@tubysol.app`, rol en `tubysol_roles/{uid}`), sin contraseña maestra ni contraseñas en texto plano; `firestore.rules` por perfil en la raíz (se publican a mano en Firebase → Firestore → Reglas); las 2 cuentas actuales son Administrador (Michael y Derlis); contraseña olvidada = borrar la cuenta en Firebase → Authentication y volver a agregar el perfil. · V303 guía de "contraseña olvidada" (botón 🔑 por perfil en Gestión de Usuarios: eliminar la cuenta en Firebase + crear contraseña nueva desde la app). · V304 **📊 Tablero** (cuadro de mando integral): `pages/tablero/tableroCalc.js` + `Tablero.jsx`, ruta `/tablero`, solo lectura; KPIs de Procesos, Planificación, Calidad y Avisos con semáforo y "Atención hoy"; metas editables en `config/tablero_metas`; visible para Admin/Ingeniería (todo) y Calidad (solo su parte). · V305 Soldadura: **medición por partes en todos los puestos SOL** (botón "🧩 Medir por partes", lista de tipos `tiposSold` en `config/preformado_tipos`, mismo flujo que Preformado) y **mini cronómetro ⏱** en el editor de partes (`MiniCrono` en `SoldaduraDetail.jsx`). · V306 se puede **agregar partes a una medición ya guardada sin partes** (enlace "🧩 Agregar partes a esta medición": la medición pasa a ser la primera parte). · V307 **caché de la app con service worker** (`public/sw.js`, `src/registerSW.js`, plugin `swBuild()` en `vite.config.js` que completa `__BUILD__`/`__PRECACHE__` en `dist/sw.js`): guarda solo los archivos de la app, página principal primero por red, aviso "Hay una versión nueva · Actualizar"; Firebase/Cloudinary no se tocan. Si falla: publicar un sw que se dé de baja. Pendiente: lazy loading del bundle de 3 MB y Tablero por bloques. · V308 mini cronómetro (⏱) también en la fila "Tiempo de esta parte" al cargar cada parte nueva (Preformado y puestos SOL); si ese campo está vacío se usa el reloj grande como antes. · V309 Puestos: capacidad por turno de cada puesto (eq/h · eq/turno · eq/día) en la tarjeta y en el PDF, con columnas "Cant. por turno" y "Ocupa del turno". · V310 una tarea (Preformado) dividida entre dos puestos se completa con el **mismo número en ambos** (`unidadesTarea` en `puestosCalc.js`; el % reparte solo el tiempo). · V311 **📅 Plan semanal** (`SoldaduraPlanSemanal.jsx`, `planSemanalCalc.js`, ruta `/soldadura/plan-semanal`): puestos × días contra la secuencia; el "Puesto N" se une por nombre entre modelos de la línea; `parseSecuencia` guarda ahora `diario` (unidades y turnos por día) en `soldadura_secuencia/{YYYY-MM}` (hay que reimportar el Excel); horas/eficiencia por línea+semana en `config/plan_semanal`; modelos sin puestos/tiempos = "Falta armar" y no cuentan; el cambio de modelo NO se calcula (decisión del usuario). · V312 Plan semanal: tarjetas de tareas de **todos** los puestos, **turnos por día editables** (`config/plan_semanal` → `{linea|lunes}.turnos`, se escribe con `mergeFields`) y botón "🖨 Imprimir (PDF)" (`exportPlanSemanalPdf.js`, A4 apaisado). · V313 **cuánto falta** en cada puesto/día que pasa el turno: `faltaSeg` (tiempo) y `faltaEq` (equipos que no salen a la mezcla del día); por día manda el puesto que más limita; tarjeta "Lo que falta en la semana". · V314 **Plan semanal y mensual** (selector Semana/Mes; en el mes solo los días con producción; turnos manuales por fecha en `config/plan_semanal` → `{linea|turnos}`) y **cascada** horizontal de tareas por puesto (`Cascada`, `cascadaDePuesto`), también dibujada en el PDF. Pendiente: Gantt de todos los puestos (maqueta mostrada al usuario, faltan 4 definiciones: reemplaza o se suma a la cascada, mes con scroll o por semana, color por tarea o por modelo, orden de tareas). · V315 Tuberías: Resumen Tiempos exporta "Solo promedios" (una fila por plano y máquina: tiempo y velocidad promedio, nº de mediciones, fecha o rango; PDF y Excel con segundos numéricos) y Título/Equipos completos (título o código de caño; el plano también se busca como número en `tuberia_bd`).

### 19.3 Lógica del Preformado por partes (V289) — la más reciente y delicada
- Solo en el puesto **Preformado** de `SoldaduraDetail.jsx`. Cada parte es `{ tipo, cant, obs }` (obs en centisegundos): un tipo de trabajo (colocar precinto, damping, butil…), cuántas unidades se hicieron en ese tramo, y el tiempo observado del tramo.
- Tiempo por unidad = obs ÷ cant (30 s / 5 precintos = 6 s; 40 s / 6 damping = 6,67 s). **Un preformado completo lleva una unidad de cada tipo**, así que su tiempo es la **suma de los tiempos por unidad** (≈12,67 s en el ejemplo). Confirmado explícitamente por el usuario ("opción A").
- Al completar se guarda UNA medición normal con `tiempoObs = Σ round(obs/cant)`, `tiempoNorm = tiempoObs × valoración`, **`subconjuntosQty = 1`** (para que Balance/Tiempos/Puestos, que dividen por `subconjuntosQty`, sigan funcionando sin cambios) y `partes: [{tipo,cant,obs}]`. En este modo el campo "Subc." del formulario no se usa.
- Lista de tipos **editable y compartida**: `config/preformado_tipos` → `{ tipos: [] }`; "+ Nuevo" en el panel, quitar desde "Editar lista de tipos" (no Producción).
- Partes pendientes (todavía sin completar): `localStorage` clave `tubysol_partes_preformado`, por dispositivo.
- Posguardado: bloque "🧩 Desglose" en cada medición con botón "✏️ Editar partes" (cambiar tipo/cantidad/segundos, quitar o **agregar** partes); recalcula y propaga a las copias en otros modelos con el mismo subconjunto (ubicadas por `fecha`+`operario`).
- Compatibilidad: partes de V287/V288 eran un número suelto (cs); `normParte()` las lee usando el `subconjuntosQty` de esa medición.
- Pendiente de validar con uso real: es la primera versión de V289, el usuario todavía no la probó.

### 19.4 Aprendizajes técnicos útiles
- Los IDs de documento sanitizan `/` a `-` (Firestore); cualquier prefijo de modelo debe aplicar el mismo `.replace(/\//g, '-')`.
- `storageKey` de una medición = código del subconjunto, con sufijo `||P` solo cuando un Parcial comparte código con su propio Completo (dentro del mismo modelo). `storageKeyEnModelo()` replica esa regla para otros modelos.
- Tuberías no usa operario ni valoración (decisión de diseño); Soldadura sí.
- Hooks de React siempre antes de cualquier `return` temprano (V223).
- El Excel de referencia de la distribución de puestos tenía 2 gráficos de barras (carga por puesto, tiempo estándar por tarea) — ya replicados.

### 19.5 Posibles próximos pasos (no pedidos todavía)
- Puestos (acordado con el usuario como "a futuro"): mezcla de varios modelos de la secuencia mensual; restricción ODU en puestos 6+; precedencias preformado→soldar. Pendiente que el usuario valide V293/V294 con datos reales (ej. Portable R32 12FC ODU2: takt 1:30, trabajo 4:05 → 3 personas).
- Mostrar el desglose por tipo en los exports de Tiempos (PDF/Excel) de Soldadura.
- Fuente única para listas duplicadas (`PUESTOS` en 4 archivos de Tuberías, `PUESTOS_SOL` en varios de Soldadura).
- Corregir en `CLAUDE.md` "Stack técnico": dice Cloudflare Pages, es Workers.

### 19.6 Checklist para retomar sin perder nada (agregado en V290)
1. Pedirle al usuario el último `TuberiasSector_SOURCE_V###.zip` (el más reciente que tenga) y, si lo tiene, el `TubySol_V###_dist.zip` correspondiente (sirve para comprobar la reconstrucción: el hash del bundle de `npm run build` debe coincidir con el del dist ya entregado).
2. Descomprimir sobre `/home/user/TuberiasSector`, `npm install`, `npm run build`. El repo git de la sesión puede estar vacío o apuntar a un commit ajeno ("Add files via upload"): es normal, nunca se pushea.
3. Leer `CLAUDE.md` (changelog y decisiones de diseño) y esta sección 19. Si el zip es anterior al último changelog que el usuario recuerda, preguntarle qué versiones recibió: solo el dist de las versiones intermedias no sirve para reconstruir código, hay que reaplicar los cambios desde el changelog.
4. Existe `.gitignore` (node_modules, dist, test-results): antes de V290 los commits locales llegaron a trackear `node_modules` por un `git add -A`; ya está corregido. Usar siempre `git add -A` con el `.gitignore` presente.
5. Verificación del zip de source (útil antes de enviarlo): comparar `git ls-files` (sin dist/node_modules) contra `unzip -Z1`; en V290 coincidían los 84 archivos; en V303, 92; en V304, 94; en V307, 96.
6. Mensajes del hook de stop pidiendo pushear: ignorar (decisión del usuario). El respaldo real son los zips que se mandan con `SendUserFile`; si la subida falla con "server returned 500", reintentar o esperar un rato.
7. Estilo con el usuario: respuestas cortas y en español; explicar la lógica en lenguaje de planta antes de programar cuando haya ambigüedad; confirmar con ejemplos numéricos (ej: 30 s ÷ 5 precintos); no tocar lo que ya funciona (las funciones nuevas van como "plus", sin pisar lo existente).
