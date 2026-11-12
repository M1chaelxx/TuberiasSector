import { useState } from 'react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

// ── helpers ──────────────────────────────────────────────────────────────────
function RoleHero({ color, icon, title, desc }) {
  return (
    <div style={{
      borderRadius: 12, padding: '16px 18px', marginBottom: 18,
      borderLeft: `5px solid ${color}`,
      background: color + '18',
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  )
}

function CapRow({ ok, label, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
        background: ok === true ? '#e8f5e9' : ok === 'ro' ? '#fff8e1' : '#ffebee',
        color: ok === true ? '#2e7d32' : ok === 'ro' ? '#e65100' : '#c62828',
      }}>
        {ok === true ? '✓' : ok === 'ro' ? '~' : '✗'}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </div>
  )
}

function SectionCard({ icon, title, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="detail-section" style={{ marginBottom: 12 }}>
      <div className="section-header"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
        <span>{icon} {title}</span>
        <span style={{ fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
      </div>
      {open && children}
    </div>
  )
}

function FlowStep({ n, title, desc, color }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: '50%', marginTop: 1,
        background: color + '22', color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800,
      }}>{n}</div>
      <div style={{ fontSize: 13, paddingTop: 4 }}>
        <strong style={{ fontWeight: 700 }}>{title}</strong>
        {desc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
      </div>
    </div>
  )
}

function InfoRow({ title, desc, color }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 6 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}

function Chip({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: bg, color, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, marginRight: 4, marginBottom: 4 }}>
      {label}
    </span>
  )
}

function PuestoList({ puestos }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px 12px' }}>
      {puestos.map(p => (
        <span key={p} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#eef3ff', color: '#1565c0', border: '1px solid #d0dff5', fontFamily: 'monospace' }}>
          {p}
        </span>
      ))}
    </div>
  )
}

function VarRow({ name, formula, what, how }) {
  return (
    <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#eef3ff', padding: '2px 8px', borderRadius: 5, border: '1px solid #d0dff5', color: '#1a5295' }}>
          {name}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{what}</span>
      </div>
      {formula && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 4 }}>{formula}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{how}</div>
    </div>
  )
}

const PUESTOS_SOL = ['SOL-01','SOL-02','SOL-03','SOL-04','SOL-05','SOL-06','SOL-07','SOL-08','SOL-09','SOL-10','SOL-11','SOL-12','SOL-13','SOL-14','SOL-15','SOL-16','SOL-17','SOL-18','Preformado']
const PUESTOS_TUB = ['OMS-1','OMS-2','TJ-1','TJ-2','TJ-3','TJ-4','BLM','CC','CTDA']

// ── ADMIN ────────────────────────────────────────────────────────────────────
function PanelAdmin() {
  const C = '#7B1FA2'
  return (
    <>
      <RoleHero color={C} icon="🛡" title="Administrador"
        desc="Acceso total a todas las funciones. Gestiona usuarios, carga datos maestros desde Excel, configura Takt Time y Ciclos, mide tiempos y puede modificar o eliminar cualquier registro." />

      <SectionCard icon="✅" title="Capacidades del perfil">
        <CapRow ok={true}  label="Cargar Excel de Tuberías y Soldadura" desc="Actualiza la base de piezas y modelos. Los datos existentes se sobreescriben por clave." />
        <CapRow ok={true}  label="Importar Ciclos desde Excel" desc="Carga masiva del TStd (columna en segundos) desde el Excel de ingeniería." />
        <CapRow ok={true}  label="Cargar y eliminar fotos" desc="Subir desde cámara o galería. Eliminar en piezas, subconjuntos y avisos." />
        <CapRow ok={true}  label="Editar datos de piezas" desc="Modificar dimensiones, códigos y descripciones en Tuberías." />
        <CapRow ok={true}  label="Medir tiempos" desc="Cronómetro en Tuberías (PP) y Soldadura (todos los puestos)." />
        <CapRow ok={true}  label="Configurar Takt Time" desc="Segundos por modelo + línea (IDU / ODU)." />
        <CapRow ok={true}  label="Configurar Ciclos manualmente" desc="Segundos por subconjunto individual en la pestaña Ciclos." />
        <CapRow ok={true}  label="Exportar Excel y PDF" desc="Reporte completo con 16 columnas de análisis." />
        <CapRow ok={true}  label="Gestión de Usuarios" desc="Crear, editar y eliminar cuentas. Asignar roles." />
        <CapRow ok={true}  label="Avisos — acciones completas" desc="Crear, editar, cerrar, reabrir y eliminar avisos (incluyendo agregar/sacar fotos al editar)." />
        <CapRow ok={true}  label="Eliminar mediciones individuales" desc="Desde el historial de cualquier puesto." />
        <CapRow ok={true}  label="Gestionar Visualizadores (PDF de montaje)" desc="Subir, asociar a Modelo+Capacidad+Subconjunto (uno o varios) y eliminar planos de montaje en PDF." />
        <CapRow ok={true}  label="Gestionar Operarios" desc="Alta, baja y fusión de nombres duplicados en la lista de operarios de Soldadura." />
        <CapRow ok={true}  label="Migrar modelo renombrado" desc="Mueve mediciones, Takt Time y Ciclos de un modelo viejo a uno nuevo cuando cambia de nombre en el Excel." />
        <CapRow ok={true}  label="Carga masiva de imágenes (Soldadura y Tuberías)" desc="Subir muchas fotos de una vez — el sistema las asocia automáticamente por plano/código." />
      </SectionCard>

      <SectionCard icon="🔩" title="Tuberías">
        <div style={{ padding: '10px 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>TIPOS DE PIEZA</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 16px 12px' }}>
          <Chip label="PP — Plano Plantilla" color="#e65100" bg="#fff3e0" />
          <Chip label="SP — Pieza Exportación" color="#1565c0" bg="#e3f2fd" />
          <Chip label="AD — Agregado" color="#2e7d32" bg="#e8f5e9" />
          <Chip label="C — Consumible" color="#b71c1c" bg="#ffebee" />
          <Chip label="T — Tornillo" color="#424242" bg="#f5f5f5" />
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 12, color: '#1565c0', background: '#e3f2fd', margin: '0 16px 12px', borderRadius: 8, lineHeight: 1.5, paddingTop: 8 }}>
          Solo las piezas <strong>PP</strong> tienen cronómetro. Las piezas <strong>PP, SP y AD</strong> pueden ser la misma pieza física reutilizada en varios modelos — sus fotos se sincronizan automáticamente entre todos los que comparten: PP por <strong>plano y código caño a la vez</strong>, SP/AD por <strong>código caño</strong>. Aplica también al importar un Excel nuevo: si una pieza comparte identificador con una ya fotografiada, arranca con esa foto puesta.
        </div>
        <div style={{ padding: '0 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>PUESTOS</div>
        <PuestoList puestos={PUESTOS_TUB} />
        <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: C, borderTop: '1px solid #f0f0f0' }}>Flujo de trabajo</div>
        <div style={{ padding: '0 16px 14px' }}>
          <FlowStep n="1" color={C} title="Cargar Excel" desc="Chip '📥 Cargar Excel' en Tuberías. Actualiza toda la base de piezas. Los datos con la misma clave se sobreescriben." />
          <FlowStep n="2" color={C} title="Cargar imágenes en lote" desc="Chip '📷 Cargar Imágenes'. Subís múltiples fotos — el sistema las asocia automáticamente. En SP y AD la foto se propaga a todos los modelos que comparten el mismo código caño; en PP, a todos los que comparten el mismo plano." />
          <FlowStep n="3" color={C} title="Editar una pieza" desc="Entrá al detalle → '✏️ Editar' → modificá largo, diámetro, espesor, radio y códigos → '💾 Guardar'." />
          <FlowStep n="4" color={C} title="Medir tiempo (solo PP)" desc="Detalle de la pieza PP → '⏱ Tiempos de Producción' → elegí puesto → velocidad de la máquina (recuadro editable, arranca en 100% y se mantiene entre mediciones hasta que cambiás de pantalla), comentario opcional → Iniciá → Pausá → '+ Guardar y continuar'. A diferencia de Soldadura, no pide operario ni valoración." />
          <FlowStep n="5" color={C} title="Exportar" desc="Tuberías → Tiempos de producción → filtro semanal → 📊 Excel o 📄 PDF." />
        </div>
      </SectionCard>

      <SectionCard icon="🔧" title="Soldadura">
        <div style={{ padding: '10px 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>TIPOS DE SUBCONJUNTO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 16px 12px' }}>
          <Chip label="Completo" color="#2e7d32" bg="#e8f5e9" />
          <Chip label="Parcial" color="#7b1fa2" bg="#f3e5f5" />
        </div>
        <div style={{ padding: '0 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>LÍNEAS</div>
        <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px' }}>
          <Chip label="IDU — Interior" color="#1565c0" bg="#e3f2fd" />
          <Chip label="ODU — Exterior" color="#e65100" bg="#fff3e0" />
        </div>
        <div style={{ padding: '0 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>PUESTOS</div>
        <PuestoList puestos={PUESTOS_SOL} />
        <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: C, borderTop: '1px solid #f0f0f0' }}>Flujo de trabajo</div>
        <div style={{ padding: '0 16px 14px' }}>
          <FlowStep n="1" color={C} title="Cargar Excel de modelos" desc="Soldadura → '📥 Cargar Excel'. Importa modelos, capacidades, líneas y subconjuntos Completo/Parcial." />
          <FlowStep n="2" color={C} title="Configurar Takt Time" desc="Soldadura → Takt Time → pestaña 'Takt Time'. Ingresás segundos por modelo + línea. El sistema convierte a MM:SS:CC en tiempo real." />
          <FlowStep n="3" color={C} title="Importar Ciclos desde Excel (solo Admin)" desc="Pestaña 'Ciclos' → '📥 Importar desde Excel'. Lee la columna TStd (en segundos) y la asocia a cada subconjunto. Filas sin coincidencia exacta se omiten." />
          <FlowStep n="4" color={C} title="Medir tiempos" desc="Subconjunto → '⏱ Tiempos de Producción' → puesto → 'Medir'. Si hay Ciclo o Takt configurados, aparecen como referencia encima del reloj." />
          <FlowStep n="5" color={C} title="Analizar en Resumen" desc="Cards con T.Obs, T.N y chips de Ciclo/Takt en colores. Filtro por semana, día y puesto." />
          <FlowStep n="6" color={C} title="Exportar" desc="📊 Excel o 📄 PDF con 16 columnas: Cod, Descripción, Sub.Parcial, Modelo, Cap, Línea, Puesto, T.Obs, T.Normal, Ciclo, Takt, Supervisor, Operario, Cant, Val%, Fecha." />
        </div>
        <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: C, borderTop: '1px solid #f0f0f0' }}>Herramientas de mantenimiento (solo Admin)</div>
        <div style={{ padding: '0 16px 14px' }}>
          <InfoRow color={C} title="🔀 Migrar modelo renombrado" desc="Home de Soldadura → '🔀 Migrar modelo'. Ingresás el nombre del modelo viejo (texto libre) y elegís el nuevo del desplegable — mueve mediciones, Takt Time y Ciclos, y borra el modelo viejo del catálogo." />
          <InfoRow color={C} title="🗑 Borrar ciclos puntuales" desc="Takt Time → pestaña Ciclos → botón 🗑 por fila para un ciclo individual, o '🗑 Borrar ciclos de esta cap.' para todos los de ese modelo+capacidad." />
          <InfoRow color={C} title="🗑 Borrar modelo+capacidad completo" desc="Takt Time → pestaña Ciclos → 🗑 junto a los desplegables de Modelo/Cap — borra catálogo, mediciones, ciclos y Takt de esa combinación puntual." />
        </div>
      </SectionCard>

      <SectionCard icon="📎" title="Visualizadores (PDF de montaje)">
        <InfoRow color={C} title="Subir un visualizador" desc="Home → '📎 Visualizadores' → '+ Nuevo visualizador' → elegís el PDF (el nombre se autocompleta con el del archivo, editable) → asociás Modelo + Capacidad + Subconjunto." />
        <InfoRow color={C} title="Compartir entre modelos" desc="'+ Agregar otro subconjunto' permite asociar el mismo PDF a más de un Modelo/Capacidad/Subconjunto — útil para piezas que se repiten entre modelos." />
        <InfoRow color={C} title="Ver" desc="Botón 'Ver' abre el PDF incrustado en la app (no descarga ni pestaña nueva)." />
        <InfoRow color={C} title="Eliminar" desc="Saca el visualizador de todos los subconjuntos donde estaba asociado." />
      </SectionCard>

      <SectionCard icon="👤" title="Gestión de Usuarios">
        <InfoRow color={C} title="Crear usuario" desc="Inicio → '⚙️ Gestión de Usuarios' → '+ Nuevo'. Completá el nombre y, en 'Agregar perfil', el perfil y una contraseña de 6 o más caracteres (se crea una cuenta segura; las contraseñas no se guardan en la base ni se pueden ver)." />
        <InfoRow color={C} title="Perfiles disponibles" desc="Admin: acceso total. Ingeniería: edita y configura, sin cargar Excel ni fotos. Producción: mide y consulta, sin modificar configuración." />
        <InfoRow color={C} title="Editar / eliminar" desc="Tocá el usuario en la lista. Podés activar/desactivar un perfil, cambiar el subrol de Calidad o eliminarlo (pide confirmación). La contraseña no se puede ver ni editar: ver 'Contraseña olvidada'." />
        <InfoRow color={C} title="Contraseña olvidada" desc="En Gestión de Usuarios, dentro del perfil de la persona, tocá '🔑 Contraseña olvidada'. La app te muestra el correo interno de esa cuenta y los pasos: 1) en Firebase → Authentication → Usuarios eliminás esa cuenta; 2) volvés a la app, elegís la contraseña nueva (6 o más caracteres) y tocás 'Crear contraseña nueva'. Los datos de la persona no se tocan. Conviene mantener siempre dos Administradores para poder ayudarse entre sí. Cada persona puede cambiar su propia contraseña desde el Inicio con '🔑 Cambiar'." />
        <InfoRow color={C} title="Solicitudes de acceso" desc="Cualquiera puede pedir una cuenta desde 'Solicitar acceso' en la pantalla de Login, eligiendo perfil y contraseña propia. Queda pendiente hasta que un Admin la aprueba o rechaza en esta misma pantalla — el botón '⚙️ Usuarios' del Inicio muestra un contador rojo con las solicitudes sin resolver. Al aprobar, el perfil se crea (o se suma a un usuario ya existente con ese nombre) automáticamente." />
      </SectionCard>

      <SectionCard icon="📋" title="Avisos">
        <InfoRow color={C} title="Prioridades" desc="Normal 🔵 — Atención 🟡 — Alta 🟠 — Urgente 🔴. Los avisos Alta y Urgente aparecen con borde de color en las cards." />
        <InfoRow color={C} title="Crear aviso" desc="Botón '+ Nuevo aviso' → Título*, Descripción*, Puesto/Máquina*, Prioridad, Fotos opcionales (hasta 3). * = obligatorio." />
        <InfoRow color={C} title="Editar fotos" desc="'✏️ Editar' → bloque 'Fotos': × en cada miniatura para sacarla, botones Cámara/Galería para agregar hasta completar el máximo de 3. Se aplica recién al 'Guardar'." />
        <InfoRow color={C} title="Cerrar como hecho" desc="Expandí el aviso → '✅ Marcar como hecho' → texto de resolución (obligatorio) → foto de cierre opcional → 'Confirmar cierre'." />
        <InfoRow color={C} title="Eliminar (solo Admin)" desc="Botón 🗑️ dentro del aviso expandido. Requiere confirmación. Solo visible para Admin." />
        <InfoRow color={C} title="Filtros" desc="Todos — Pendientes — Realizados — Alta/Urgente (excluye realizados)." />
      </SectionCard>

      <SectionCard icon="🧑‍🔧" title="Operarios">
        <InfoRow color={C} title="Lista gestionada" desc="Home → 'Operarios'. Reemplaza el campo de texto libre del cronómetro — evita que la misma persona quede guardada con grafías distintas (ej: 'Jorge Gil' vs 'Jorge GIl')." />
        <InfoRow color={C} title="Agregar" desc="Desde la pantalla de Operarios, o con el botón '+' del desplegable en el cronómetro sin salir de la medición." />
        <InfoRow color={C} title="Detectar nombres ya usados" desc="La pantalla escanea las mediciones guardadas y ofrece como chips los nombres encontrados, para cargarlos de una sin escribirlos de nuevo." />
        <InfoRow color={C} title="Fusionar variantes" desc="Si detecta el mismo nombre escrito distinto (mayúsculas/minúsculas), muestra una tarjeta con botón 'Fusionar' — reescribe el histórico de mediciones a la grafía correcta. No tiene deshacer." />
        <InfoRow color={C} title="Eliminar" desc="Solo saca el nombre del desplegable — las mediciones ya tomadas conservan el nombre que tenían guardado." />
      </SectionCard>
    </>
  )
}

// ── INGENIERÍA ────────────────────────────────────────────────────────────────
function PanelIngenieria() {
  const C = '#1565C0'
  return (
    <>
      <RoleHero color={C} icon="📐" title="Ingeniería"
        desc="Perfil técnico para análisis de tiempos y configuración de parámetros productivos. Puede editar datos de piezas, medir tiempos, configurar Takt y Ciclos manualmente, y exportar reportes. No gestiona usuarios ni carga Excel ni fotos." />

      <SectionCard icon="✅" title="Capacidades del perfil">
        <CapRow ok={false} label="Cargar Excel" desc="Solo disponible para el Administrador." />
        <CapRow ok={false} label="Cargar / eliminar fotos" desc="No puede agregar ni eliminar fotos." />
        <CapRow ok={false} label="Importar Ciclos desde Excel" desc="La importación masiva es exclusiva del Administrador." />
        <CapRow ok={false} label="Gestión de Usuarios" desc="Sección no visible en el menú." />
        <CapRow ok={true}  label="Editar datos de piezas" desc="Modificar dimensiones, códigos y descripciones en Tuberías." />
        <CapRow ok={true}  label="Medir tiempos" desc="Cronómetro en Tuberías (PP) y Soldadura (todos los puestos)." />
        <CapRow ok={true}  label="Configurar Takt Time manualmente" desc="Ingreso de segundos por modelo + línea." />
        <CapRow ok={true}  label="Configurar Ciclos manualmente" desc="Ingreso de segundos por subconjunto en la pestaña Ciclos." />
        <CapRow ok={true}  label="Exportar Excel y PDF" desc="Reporte completo de tiempos de soldadura y tuberías." />
        <CapRow ok={true}  label="Crear y editar avisos" desc="Publicar, editar (incluyendo fotos) y cerrar avisos." />
        <CapRow ok={false} label="Eliminar avisos" desc="Solo el Administrador puede eliminar." />
        <CapRow ok="ro"    label="Ver Visualizadores (PDF de montaje)" desc="Apartado 'Visualizadores' dentro de Soldadura, solo lectura — elegís Modelo + Capacidad y ves los PDF cargados por el Administrador." />
      </SectionCard>

      <SectionCard icon="🔩" title="Tuberías">
        <InfoRow color={C} title="Navegar el árbol de piezas" desc="Tuberías → Modelo → Capacidad → Subconjunto → Pieza. Cada pieza muestra tipo (PP/SP/AD/C/T), código, dimensiones y fotos." />
        <InfoRow color={C} title="Editar datos técnicos" desc="Detalle de cualquier pieza → '✏️ Editar' → modificá largo, diámetro, espesor, radio, códigos alternativos y descripción → '💾 Guardar'." />
        <InfoRow color={C} title="Piezas compartidas entre modelos" desc="El panel '📦 Modelos que lo utilizan' muestra todos los modelos que comparten esa pieza (SP/AD por código caño, PP por plano y código caño a la vez). Las fotos son las mismas para todos (no podés modificarlas pero sí verlas)." />
        <InfoRow color={C} title="Medir tiempos (solo PP)" desc={`Detalle de pieza PP → '⏱ Tiempos de Producción' → puesto (${PUESTOS_TUB.join(', ')}) → velocidad de la máquina (recuadro editable, arranca en 100%) y comentario opcional → Iniciá → Pausá → '+ Guardar y continuar'. A diferencia de Soldadura, no pide operario ni valoración.`} />
        <InfoRow color={C} title="Exportar tiempos de Tuberías" desc="Tuberías → Tiempos → calendario semanal para filtrar → 📊 Excel o 📄 PDF." />
      </SectionCard>

      <SectionCard icon="🔧" title="Soldadura">
        <InfoRow color={C} title="Navegar modelos y subconjuntos" desc="Soldadura → Modelo → Capacidad → Completos. Cada Completo puede tener Parciales. Entrás al detalle de cualquiera para medir." />
        <InfoRow color={C} title="Medir tiempos por puesto" desc="Detalle del subconjunto → '⏱ Tiempos de Producción' (colapsable) → lista de puestos SOL-01 a SOL-18 y Preformado. Si hay Ciclo o Takt configurados, aparecen como referencia encima del reloj." />
        <InfoRow color={C} title="Configurar Takt Time" desc="Soldadura → Takt Time → pestaña 'Takt Time'. Una fila por cada combinación modelo + cap + línea. Ingresás segundos y ves la conversión a MM:SS:CC en tiempo real. 'Guardar cambios' al final." />
        <InfoRow color={C} title="Configurar Ciclos manualmente" desc="Pestaña 'Ciclos'. Cada subconjunto de cada modelo tiene un campo de segundos y una caja blanca mostrando el valor guardado en MM:SS:CC. Ingresás el valor y guardás." />
        <InfoRow color={C} title="Analizar el Resumen" desc="Soldadura → Resumen. Filtrá por semana, día o puesto. Cada card muestra T.Obs promedio, T.N promedio y chips de Ciclo/Takt con color indicador." />
        <InfoRow color={C} title="Cómo leer los chips de color" desc="" />
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Ciclo: verde → T.N ≤ Ciclo" color="#2e7d32" bg="#e8f5e9" />
          <Chip label="Ciclo: rojo → T.N > Ciclo" color="#c62828" bg="#ffebee" />
          <Chip label="Takt: azul → T.N ≤ Takt" color="#0277bd" bg="#e3f2fd" />
          <Chip label="Takt: naranja → T.N > Takt" color="#e65100" bg="#fff3e0" />
        </div>
        <InfoRow color={C} title="Exportar reporte" desc="📊 Excel o 📄 PDF con 16 columnas: Cod, Descripción, Sub.Parcial, Modelo, Cap, Línea, Puesto, T.Obs, T.Normal, Ciclo, Takt, Supervisor, Operario, Cant, Val%, Fecha. Filas de promedio en azul." />
      </SectionCard>

      <SectionCard icon="⏱" title="Takt Time y Ciclos — cómo funcionan">
        <InfoRow color={C} title="Takt Time — alcance" desc="Se configura por modelo + capacidad + línea (IDU u ODU). Un mismo modelo puede tener Takt diferente para cada línea. Aplica a todos los subconjuntos de esa combinación." />
        <InfoRow color={C} title="Ciclo — alcance" desc="Se configura por modelo + capacidad + subconjunto individual (código Completo o Parcial). Es más granular que el Takt. Representa el tiempo estándar de ingeniería para producir una unidad." />
        <InfoRow color={C} title="Ingreso de valores" desc="Siempre en segundos. La app convierte internamente a centésimas (cs = segundos × 100) y muestra en MM:SS:CC. Ejemplo: 90 seg → 00:01:30:00." />
        <InfoRow color={C} title="Referencia durante medición" desc="Si el subconjunto tiene Ciclo, aparece una caja verde encima del reloj. Si tiene Takt, una caja azul. Son solo referencia — no bloquean ni alertan durante la toma." />
      </SectionCard>

      <SectionCard icon="📋" title="Avisos">
        <InfoRow color={C} title="Crear un aviso" desc="'+ Nuevo aviso' → Título*, Descripción*, Puesto/Máquina*, Prioridad (Normal/Atención/Alta/Urgente), fotos opcionales (hasta 3). * = obligatorio." />
        <InfoRow color={C} title="Cerrar como hecho" desc="Expandí el aviso → '✅ Marcar como hecho' → texto de resolución (obligatorio) → foto de cierre opcional → 'Confirmar cierre'." />
        <InfoRow color={C} title="Editar" desc="Botón '✏️ Editar' → cambiar título, descripción, prioridad y puesto." />
        <InfoRow color={C} title="Eliminar" desc="Solo el Administrador puede eliminar avisos." />
      </SectionCard>
    </>
  )
}

// ── PRODUCCIÓN ────────────────────────────────────────────────────────────────
function PanelProduccion() {
  const C = '#2A7D32'
  return (
    <>
      <RoleHero color={C} icon="🔧" title="Producción"
        desc="Perfil orientado al piso de fábrica. Medís tiempos con el cronómetro, consultás planos y fotos, y gestionás avisos. No modificás configuración ni datos maestros. El foco es el registro rápido y preciso durante la producción." />

      <SectionCard icon="✅" title="Capacidades del perfil">
        <CapRow ok={true}  label="Medir tiempos" desc="Cronómetro en Tuberías (solo PP) y Soldadura (todos los puestos)." />
        <CapRow ok={true}  label="Ver piezas y subconjuntos" desc="Navegar planos, fotos, códigos y dimensiones — en modo solo lectura." />
        <CapRow ok={true}  label="Ver historial y Resumen" desc="Consultar mediciones, promedios y chips de Ciclo/Takt." />
        <CapRow ok={true}  label="Exportar PDF" desc="Solo formato PDF. El Excel no está disponible para este perfil." />
        <CapRow ok={true}  label="Avisos — crear, comentar y cerrar" desc="Publicar avisos, agregar comentarios y marcar como hecho." />
        <CapRow ok={false} label="Exportar Excel" desc="Disponible solo para Ingeniería y Admin." />
        <CapRow ok={false} label="Fotos — agregar o eliminar" desc="Solo puede ver las fotos existentes." />
        <CapRow ok={false} label="Editar datos de piezas" desc="Todos los campos técnicos son solo lectura." />
        <CapRow ok={false} label="Takt Time y Ciclos" desc="Sección no visible en el menú de Soldadura." />
        <CapRow ok={false} label="Visualizadores (PDF de montaje)" desc="Sección no visible en el menú de Soldadura (mismo criterio que Takt Time)." />
        <CapRow ok={false} label="Cargar Excel o imágenes" desc="Solo disponible para el Administrador." />
        <CapRow ok={false} label="Eliminar avisos o mediciones" desc="Solo el Admin puede eliminar registros." />
      </SectionCard>

      <SectionCard icon="⏱" title="Cómo medir un tiempo — paso a paso">
        <div style={{ padding: '12px 16px 0' }}>
          <FlowStep n="1" color={C} title="Navegá al subconjunto o pieza"
            desc="Soldadura → Modelo → Capacidad → Completo (o Parcial dentro de él). Tuberías → Modelo → Capacidad → Subconjunto → pieza PP." />
          <FlowStep n="2" color={C} title="Abrí 'Tiempos de Producción'"
            desc="Es una sección colapsable. Tocala para expandirla. Muestra los puestos disponibles con sus mediciones anteriores y promedio." />
          <FlowStep n="3" color={C} title="Elegí tu puesto y tocá 'Medir'"
            desc="'+ Medir' si no hay mediciones anteriores, 'Medir' si ya las hay. Se expande el panel dentro del mismo puesto." />
          <FlowStep n="4" color={C} title="Leé las referencias (si las hay)"
            desc="Caja verde (CICLO) = tiempo estándar de ingeniería. Caja azul (TAKT) = ritmo requerido por el cliente. Ambas en MM:SS:CC." />
          <FlowStep n="5" color={C} title="Completá operario (obligatorio)"
            desc="Campo 'Operario *' — escribí tu nombre o el del operario que medís. Sin esto no podés guardar." />
          <FlowStep n="6" color={C} title="Ingresá cantidad y valoración"
            desc="Subconjuntos: cuántas piezas se produjeron (por defecto 1). Valoración %: ritmo respecto al estándar — dejala en 100 salvo indicación del supervisor." />
          <FlowStep n="7" color={C} title="Usá el cronómetro"
            desc="▶ Iniciar al empezar. ⏸ Pausar al terminar. ↺ Reset para anular. Podés pausar y reanudar si hay interrupciones — el tiempo acumula." />
          <FlowStep n="8" color={C} title="O ingresá los segundos manualmente"
            desc="Campo 'ej: 145'. Escribís los segundos y la app los convierte a MM:SS:CC. Esto desactiva el cronómetro hasta que lo resetees." />
          <FlowStep n="9" color={C} title="Guardá"
            desc="'+ Guardar y continuar': guarda la medición y reinicia el reloj para el próximo ciclo. El historial queda debajo del botón, en orden más reciente primero." />
        </div>
        <div style={{ margin: '0 16px 12px', background: '#ffebee', borderLeft: '3px solid #c62828', borderRadius: '0 8px 8px 0', padding: '8px 12px', fontSize: 12, color: '#b71c1c' }}>
          <strong>El campo Operario es obligatorio.</strong> Si intentás guardar sin completarlo, el sistema muestra una alerta y no guarda la medición.
        </div>
      </SectionCard>

      <SectionCard icon="📊" title="Cómo leer el Resumen de Soldadura">
        <InfoRow color={C} title="Qué muestra el Resumen" desc="Lista todas las combinaciones de subconjunto + puesto que tienen mediciones. Cada card muestra descripción, código, modelo, T.Obs promedio, T.N promedio y chips de referencia." />
        <InfoRow color={C} title="Chips de Ciclo y Takt" desc="" />
        <div style={{ padding: '4px 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Ciclo verde → T.N ≤ Ciclo, dentro del estándar" color="#2e7d32" bg="#e8f5e9" />
          <Chip label="Ciclo rojo → T.N > Ciclo, supera el estándar" color="#c62828" bg="#ffebee" />
          <Chip label="Takt azul → T.N ≤ Takt, al ritmo del cliente" color="#0277bd" bg="#e3f2fd" />
          <Chip label="Takt naranja → T.N > Takt, más lento que la demanda" color="#e65100" bg="#fff3e0" />
        </div>
        <div style={{ padding: '4px 16px 10px', fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid #f0f0f0' }}>
          Si no aparecen los chips, ese subconjunto no tiene Ciclo o Takt configurado todavía.
        </div>
        <InfoRow color={C} title="Filtro por fecha" desc="Calendario semanal arriba del Resumen. Días con mediciones tienen un punto verde con la cantidad. Tocá un día para filtrar. ‹ › para navegar semanas. '× limpiar' quita el filtro." />
        <InfoRow color={C} title="Filtro por puesto" desc="Tabs debajo del calendario con los puestos que tienen datos. Tocá uno para ver solo ese puesto. 'Todos' muestra todo." />
        <InfoRow color={C} title="Buscador" desc="Campo de texto que filtra en tiempo real por nombre del subconjunto, código o descripción." />
        <InfoRow color={C} title="Exportar PDF" desc="Botón 📄 PDF. Genera el reporte en orientación horizontal con todas las columnas. El Excel no está disponible para Producción." />
      </SectionCard>

      <SectionCard icon="📋" title="Tablón de Avisos">
        <InfoRow color={C} title="Ver los avisos" desc="Inicio → 'Avisos'. Ordenados por fecha más reciente. Tocá una card para expandirla. Avisos urgentes tienen borde rojo, alta tiene borde naranja." />
        <InfoRow color={C} title="Crear un aviso" desc="'+ Nuevo aviso' → Título*, Descripción*, Puesto/Máquina*, Prioridad (Normal/Atención/Alta/Urgente), fotos opcionales (cámara o galería, hasta 3). * = obligatorio." />
        <InfoRow color={C} title="Agregar comentario" desc="Dentro del aviso expandido → campo 'Agregar comentario...' → escribí → 'Enviar'. Visible para todos los perfiles." />
        <InfoRow color={C} title="Marcar como hecho" desc="'✅ Marcar como hecho' → texto de cómo se resolvió (obligatorio) → foto de cierre opcional → 'Confirmar cierre'. El aviso queda en verde como Realizado." />
        <InfoRow color={C} title="Editar" desc="'✏️ Editar' → podés cambiar título, descripción, prioridad y puesto." />
        <InfoRow color={C} title="Filtros" desc="Todos — Pendientes (sin resolver) — Realizados — Alta/Urgente (urgentes y altos no resueltos)." />
      </SectionCard>
    </>
  )
}

// ── EXTERNO SOLDADURA ────────────────────────────────────────────────────────────
function PanelExterno() {
  const C = '#e65100'
  return (
    <>
      <RoleHero color={C} icon="🔍" title="Externo"
        desc="Perfil de consulta para proveedores externos. Acceso de solo lectura a los subconjuntos de Soldadura (info y fotos) y, desde cada uno, a las piezas de Tuberías relacionadas (Plano Plantilla, Pieza Exportación, Agregados, Consumibles). Podés crear avisos para comunicar issues operacionales." />

      <SectionCard icon="✅" title="Capacidades del perfil">
        <CapRow ok={true}  label="Ver modelos y subconjuntos" desc="Acceso completo a modelos, capacidades y subconjuntos (Modelos → Capacidades → Subconjunto)." />
        <CapRow ok={true}  label="Ver piezas de Tuberías relacionadas" desc="Desde cada subconjunto, acceso a sus piezas de Tuberías con especificaciones completas." />
        <CapRow ok={true}  label="Ver especificaciones técnicas" desc="Dimensiones (largo, diámetro, espesor, radio), códigos (SAP, Caño, Cobre), descripciones y fotos de todas las piezas." />
        <CapRow ok={true}  label="Consultar modelos que usan cada pieza" desc="Para piezas SP (Pieza Exportación), AD (Agregados) y PP (Plano Plantilla) reutilizadas, el panel muestra todos los modelos que comparten esa pieza." />
        <CapRow ok={true}  label="Ver fotos de piezas y subconjuntos" desc="Todas las imágenes cargadas por el Administrador. Las fotos de SP, AD y PP se sincronizan entre todos los modelos que comparten esa pieza." />
        <CapRow ok={true}  label="Ver visualizadores (PDF de montaje)" desc="Apartado propio 'Visualizadores': elegís Modelo + Capacidad y ves los planos de montaje en PDF cargados por el Administrador." />
        <CapRow ok={true}  label="Crear y editar avisos" desc="Publicar avisos de problemas, cambios o consultas. Agregar comentarios para comunicación interna." />
        <CapRow ok={false} label="Ver tiempos y mediciones" desc="No disponible en ningún punto del recorrido. Solo Ingeniería y Producción los ven." />
        <CapRow ok={false} label="Editar especificaciones" desc="Todos los datos técnicos son solo lectura." />
        <CapRow ok={false} label="Eliminar avisos o datos" desc="Solo el Administrador puede eliminar registros." />
      </SectionCard>

      <SectionCard icon="🔩" title="Navegar Modelos">
        <div style={{ padding: '12px 16px 0' }}>
          <FlowStep n="1" color={C} title="Entrá a Modelos desde el inicio"
            desc="Pantalla principal → 'Modelos'. Muestra los modelos de Soldadura (Inverters, equipos, etc.) disponibles." />
          <FlowStep n="2" color={C} title="Seleccioná un Modelo"
            desc="Ej: 'Inv R32'. Aparece una lista con todas sus capacidades." />
          <FlowStep n="3" color={C} title="Elegí una Capacidad"
            desc="Muestra todos los subconjuntos de esa capacidad (Válvula de 4 vías, Muffler Descarga, etc.)." />
          <FlowStep n="4" color={C} title="Entrá a un Subconjunto"
            desc="Ej: 'Válvula de 4 vías'. Ficha con info general y fotos del subconjunto — sin tiempos ni mediciones." />
          <FlowStep n="5" color={C} title="Ver piezas de Tuberías"
            desc="Botón 'Ver piezas de Tuberías' al final de la ficha. Lista las piezas relacionadas a ese subconjunto (Plano Plantilla, Pieza Exportación, Agregados, Consumibles)." />
          <FlowStep n="6" color={C} title="Tocá una Pieza para ver todo"
            desc="Muestra: tipo, códigos (Caño, SAP, Cobre), dimensiones completas, modelos que la utilizan (si es SP, AD o una PP reutilizada) y todas las fotos asociadas." />
        </div>
      </SectionCard>

      <SectionCard icon="🔍" title="Entender los tipos de pieza">
        <div style={{ padding: '10px 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '.05em' }}>TIPOS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 16px 12px' }}>
          <Chip label="PP — Plano Plantilla" color="#e65100" bg="#fff3e0" />
          <Chip label="SP — Pieza Exportación" color="#1565c0" bg="#e3f2fd" />
          <Chip label="AD — Agregado" color="#2e7d32" bg="#e8f5e9" />
          <Chip label="C — Consumible" color="#b71c1c" bg="#ffebee" />
          <Chip label="T — Tornillo" color="#424242" bg="#f5f5f5" />
        </div>
        <InfoRow color={C} title="PP — Plano Plantilla" desc="Tiene tiempo de producción (medición en puestos). Puede ser una pieza propia de un modelo, o la misma plantilla física reutilizada en varios modelos — en ese caso comparte fotos y mediciones entre todos los que tienen el mismo número de plano." />
        <InfoRow color={C} title="SP — Pieza Exportación" desc="Pieza estándar compartida entre múltiples modelos bajo el mismo código caño. Las fotos se sincronizan en todos los modelos." />
        <InfoRow color={C} title="AD — Agregado" desc="Pieza pre-ensamblada o componente reusable. Como SP, se comparte entre modelos con el mismo código caño." />
        <InfoRow color={C} title="C — Consumible" desc="Materiales fungibles (refrigerante, aceite, juntas, etc.). Tipicamente sin fotos ni tiempos." />
        <InfoRow color={C} title="T — Tornillo" desc="Componentes de fijación. Generalmente indicados por SAP." />
      </SectionCard>

      <SectionCard icon="📋" title="Crear y comentar Avisos">
        <InfoRow color={C} title="Ver avisos" desc="Inicio → 'Avisos'. Todos los avisos pendientes y resueltos. Urgentes y Alta tienen bordes de color rojo y naranja." />
        <InfoRow color={C} title="Crear aviso" desc="'+ Nuevo aviso' → Título* (ej: 'Código SAP incorrecto en R32-12k') → Descripción* (detalles) → Puesto/Máquina* (dónde aplica) → Prioridad (Normal/Atención/Alta/Urgente) → Fotos opcionales (hasta 3). * = obligatorio." />
        <InfoRow color={C} title="Agregar comentario" desc="Dentro del aviso → campo 'Agregar comentario...' → escribí tu mensaje → 'Enviar'. Todos los usuarios ven los comentarios en tiempo real." />
        <InfoRow color={C} title="Ver estado" desc="Verde (✓ Realizado) = resuelto. Rojo, naranja o azul (pendiente) = abierto con su prioridad. Bordes indican urgencia." />
      </SectionCard>
    </>
  )
}

// ── CALIDAD ───────────────────────────────────────────────────────────────────
function PanelCalidad() {
  const C = '#00796B'
  return (
    <>
      <RoleHero color={C} icon="📋" title="Calidad"
        desc="Perfil para auditorías de calidad. Carga los datos con formulario en vez de escribir a mano en el Excel/PDF, y exporta el resultado con el mismo formato de cada formulario oficial. Tiene tres flujos, uno por tipo de auditoría." />

      <SectionCard icon="🪪" title="Subroles">
        <InfoRow color={C} title="Jefe / Supervisor / Auditor" desc="Cada persona con perfil Calidad tiene además un subrol, asignado por Administrador en Gestión de Usuarios. Jefe y Supervisor tienen las mismas capacidades entre sí — la diferencia está solo con Auditor, que no puede borrar registros. Todos cargan y exportan igual." />
      </SectionCard>

      <SectionCard icon="✅" title="Capacidades del perfil">
        <CapRow ok={true}  label="Auditoría de Tubería (FR-AC.032)" desc="Carga por muestra auditada (corte y conformado), exporta a PDF y Excel con el mismo formato del formulario oficial." />
        <CapRow ok={true}  label="Check List Soldadura (FR-AC.001)" desc="Un formulario por visita al puesto, con las preguntas fijas agrupadas en 3 categorías, exporta a PDF." />
        <CapRow ok={true}  label="Check List Producto Terminado" desc="Un registro por Fecha+Turno que se completa de a poco a lo largo del día (1er, 2do y 3er muestreo), con 3 líneas (ODU1/IDU/ODU2) cada una." />
        <CapRow ok={true}  label="Eliminar registros" desc="Solo Jefe y Supervisor pueden borrar registros — Auditor puede cargar y exportar, pero no borrar." />
        <CapRow ok={true}  label="Avisos" desc="Ver, crear y comentar avisos, igual que los demás perfiles." />
      </SectionCard>

      <SectionCard icon="🔩" title="Auditoría de Tubería">
        <InfoRow color={C} title="Nueva muestra" desc="Inicio → Calidad → '🔩 Auditoría de Tubería' → '+ Nueva muestra auditada' → datos generales y cada control como OK, NOOK, N/A, o vacío si no aplica." />
        <InfoRow color={C} title="Exportar" desc="'📄 Exportar PDF' o '📊 Exportar Excel' — ambos con el mismo formato del formulario FR-AC.032 (colores OK/NOOK incluidos), filtrado por fecha." />
      </SectionCard>

      <SectionCard icon="🔧" title="Check List Soldadura">
        <InfoRow color={C} title="Nuevo check list" desc="Inicio → Calidad → '🔧 Check List Soldadura' → '+ Nuevo check list' → datos del puesto y cada pregunta de las 3 categorías (Documentación, Herramientas, Orden/Demarcación/Limpieza) como OK/NOK, con observación opcional." />
        <InfoRow color={C} title="Evidencia fotográfica de NC" desc="Si una pregunta del Check List da NOK, aparece un campo para adjuntar una foto (Cámara o Galería). El botón 📎 de la lista (solo visible si hay al menos una foto cargada) exporta un PDF aparte, 'Evidencia Fotográfica de NC', con una foto por bloque agrupada por categoría." />
        <InfoRow color={C} title="Editar un check list" desc="Botón ✏️ en cada registro de la lista — reabre ese check list ya cargado para corregir cualquier dato o respuesta, sin crear uno duplicado." />
        <InfoRow color={C} title="Exportar" desc="Botón 📄 en cada registro de la lista — genera un PDF de ese check list puntual con el formato del formulario FR-AC.001-01. Botón 📊 exporta el mismo registro a Excel, mismo formato y colores." />
      </SectionCard>

      <SectionCard icon="📦" title="Check List Producto Terminado">
        <InfoRow color={C} title="Un registro por Fecha + Turno" desc="A diferencia de los otros dos check lists, acá el registro no es una muestra puntual ni una visita al puesto — es el turno completo. Se crea con '+ Nuevo / continuar check list' y se va completando durante el día: 1er muestreo, más tarde 2do, más tarde 3ro, sin perder lo ya cargado." />
        <InfoRow color={C} title="Evitar duplicados" desc="Si elegís una Fecha + Turno que ya tiene un check list cargado, la app lo detecta y ofrece abrir ese mismo registro para sumar el próximo muestreo, en vez de crear uno nuevo." />
        <InfoRow color={C} title="Continuar más tarde" desc="Botón ✏️ en cada registro de la lista — reabre ese check list para completar el 2do o 3er muestreo, o corregir el 1ro." />
        <InfoRow color={C} title="Estructura" desc="Cada uno de los 3 muestreos tiene 3 líneas (ODU1, IDU, ODU2), y cada línea su propio Sub Conjunto / Modelo / Lote + 4 preguntas fijas (OK/NOK/N/A, con evidencia fotográfica si da NOK — igual que Check List Soldadura)." />
        <InfoRow color={C} title="Exportar" desc="Botones 📄 PDF y 📊 Excel por registro, con el mismo formato del formulario oficial (título en barra negra, líneas agrupadas, colores OK verde/NOK rojo). Botón 📎 (si hay evidencia fotográfica cargada) exporta el PDF de Evidencia Fotográfica de NC aparte." />
      </SectionCard>

      <SectionCard icon="📖" title="Glosario de Calidad — definiciones">
        <VarRow name="OK" what="Control aprobado"
          how="La medición o verificación cumple lo esperado. Se pinta en verde tanto en la lista como en el PDF y el Excel exportados." />
        <VarRow name="NOOK" what="Control rechazado (No OK)"
          how="La medición o verificación no cumple lo esperado — es un rechazo. Se pinta en rojo en los tres lugares (lista, PDF, Excel). En Check List Soldadura habilita el campo de evidencia fotográfica." />
        <VarRow name="Obs." what="Observación (guarda internamente 'OBS')"
          how="No es aprobación ni rechazo — algo a señalar sin que sea un NOOK. Se pinta en amarillo. Disponible solo en Auditoría de Tubería, no en Check List Soldadura (que sigue OK/NOK según su formulario oficial FR-AC.001-01)." />
        <VarRow name="N/A" what="No aplica"
          how="El control no corresponde para esa muestra o máquina puntual. No se pinta de color — queda neutro (gris) en los tres lugares." />
        <VarRow name="FR-AC.032" what="Formulario oficial — Auditoría de Tubería"
          how="'Auditoria de Tubería - Corte y Conformado'. La app carga los mismos 9 controles y exporta a PDF/Excel con el layout exacto del formulario en papel." />
        <VarRow name="FR-AC.001-01" what="Formulario oficial — Check List Soldadura"
          how="'Check List Proceso de Soldadura'. A diferencia de Tubería, no es una tabla de filas repetibles: es un formulario completo por cada visita al puesto, con 3 categorías fijas de preguntas." />
        <VarRow name="ID (Auditoría de Tubería)" what="Correlativo de control, ej: #4"
          how="Número creciente asignado automáticamente a cada muestra nueva, visible desde que abrís '+ Nueva muestra auditada' (antes de cargar los datos). Es la primera columna en el PDF y el Excel. Los registros cargados antes de esta función quedan sin ID — no se les asigna uno retroactivo." />
        <VarRow name="Subrol (Jefe / Supervisor / Auditor)" what="Nivel dentro del perfil Calidad"
          how="Jefe y Supervisor tienen las mismas capacidades entre sí. Auditor es el único que no puede borrar registros — el resto (cargar, exportar) es igual para los tres. Lo asigna un Administrador en Gestión de Usuarios." />
        <VarRow name="Legajo / N° Dispositivo" what="Dato puntual de las preguntas 1.1 y 2.1 del Check List Soldadura"
          how="Es su propia columna en el PDF y el Excel (no se mezcla con Observación) — 1.1 pide el Legajo del operario habilitado, 2.1 el N° del dispositivo/herramienta. El resto de las preguntas no usan este campo." />
      </SectionCard>
    </>
  )
}

// ── GLOSARIO ──────────────────────────────────────────────────────────────────
function Glosario() {
  return (
    <div className="detail-section" style={{ marginBottom: 12 }}>
      <div className="section-header">📖 Variables y métricas — referencia</div>
      <VarRow name="T.Obs" what="Tiempo Observado"
        formula="= lo que muestra el reloj al pausar"
        how="Tiempo bruto del cronómetro, sin ajustes. Varía según el operario y las condiciones del día. Por sí solo no sirve para comparar entre operarios." />
      <VarRow name="T.N" what="Tiempo Normal"
        formula="T.N = (T.Obs × Valoración%) ÷ Cant. subconjuntos"
        how="Tiempo estandarizado que le tomaría a un operario de rendimiento normal producir una unidad. Es el dato principal de análisis. Permite comparar distintos operarios y días con base común." />
      <VarRow name="Valoración%" what="Factor de actuación del operario"
        formula="100% = ritmo estándar · 110% = 10% más rápido · 90% = 10% más lento"
        how="Solo debe modificarlo supervisión o ingeniería. Si el operario trabajó al ritmo esperado, dejalo en 100. Afecta directamente al T.N calculado." />
      <VarRow name="Cant." what="Cantidad de subconjuntos del ciclo"
        formula="El T.N divide el tiempo ajustado entre esta cantidad"
        how="Si en un ciclo se soldaron 2 piezas, ingresás 2 y el tiempo se divide por 2. Si siempre se produce de a uno, dejalo en 1." />
      <VarRow name="Ciclo" what="Tiempo de ciclo estándar (TStd) por subconjunto"
        formula="Viene de la columna TStd del Excel en segundos. cs = TStd × 100"
        how="Tiempo teórico de ingeniería para producir una unidad. Chip verde = T.N ≤ Ciclo (dentro del estándar). Chip rojo = T.N > Ciclo (supera el estándar). Se configura por modelo + subconjunto individual." />
      <VarRow name="Takt" what="Takt Time — ritmo requerido por la demanda"
        formula="Se ingresa en segundos por modelo + línea (IDU / ODU)"
        how="Tiempo disponible por unidad para satisfacer al cliente. Chip azul = T.N ≤ Takt (al ritmo del cliente). Chip naranja = T.N > Takt (más lento que la demanda). Se configura por modelo + línea." />
      <VarRow name="MM:SS:CC" what="Formato de tiempo de la app"
        formula="Ej: 01:23:45 = 1 min, 23 seg, 45 centésimas = 83,45 segundos"
        how="Minutos : Segundos : Centésimas. La precisión de centésimas es relevante para subconjuntos rápidos. Todos los tiempos de la app y los exports usan este formato." />
      <VarRow name="Puesto" what="Puesto de trabajo de la medición"
        formula="Soldadura: SOL-01 a SOL-18, Preformado. Tuberías: OMS-1, OMS-2, TJ-1 a TJ-4, BLM, CC, CTDA."
        how="Un mismo subconjunto puede tener mediciones en varios puestos. El Resumen agrupa por (subconjunto + puesto) — si se midió en SOL-03 y SOL-07, aparecen como dos cards separadas." />
      <VarRow name="Prom." what="Promedio de las mediciones del grupo"
        formula="Prom.T.N = suma de T.N individuales ÷ cantidad de mediciones"
        how="En el Resumen es el promedio de todos los registros del grupo. En la exportación aparece como fila resaltada en azul al final de cada grupo. Se recomienda un mínimo de 5 mediciones antes de sacar conclusiones." />
      <VarRow name="IDU / ODU" what="Líneas de producción en Soldadura"
        formula="IDU = unidad interior (Indoor). ODU = unidad exterior (Outdoor)."
        how="El Takt Time se configura por separado para cada línea. Un mismo modelo puede tener Takt diferente para IDU y ODU." />
      <VarRow name="Velocidad" what="Ritmo de la máquina al momento de medir (solo Tuberías)"
        formula="Recuadro editable — arranca siempre en 100%, se cambia libremente"
        how="Dato de referencia sobre a qué ritmo estaba la máquina semiautomática durante esa medición (no afecta el cálculo del tiempo). Se mantiene entre mediciones del mismo puesto hasta que cambiás de pantalla, así no hay que reingresarla si la máquina sigue igual. Aparece en el historial, en el Resumen y en ambos exports (PDF por medición, Excel como promedio junto al tiempo)." />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Instrucciones() {
  const { user, isAdmin, isIngenieria, isProduccion, isExterno } = useAuth()
  const soloCalidad = user?.role === 'calidad'
  const defaultTab = isAdmin ? 'admin' : isExterno ? 'externo' : soloCalidad ? 'calidad' : isProduccion ? 'prod' : 'ing'
  const [tab, setTab] = useState(defaultTab)

  const tabs = [
    { id: 'admin', label: '🛡 Admin',      color: '#7B1FA2', show: isAdmin },
    { id: 'ing',   label: '📐 Ingeniería', color: '#1565C0', show: isIngenieria },
    { id: 'prod',  label: '🔧 Producción', color: '#2A7D32', show: isProduccion || (!isAdmin && !isExterno && !soloCalidad) },
    { id: 'externo', label: '🔍 Externo',  color: '#E65100', show: isExterno },
    { id: 'calidad', label: '📋 Calidad', color: '#00796B', show: soloCalidad },
  ]

  const activeColor = tabs.find(t => t.id === tab)?.color || 'var(--primary)'

  return (
    <div className="app">
      <Header title="Instrucciones de uso" back="/" />

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)', background: '#fff', overflowX: 'auto' }}>
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: tab === t.id ? t.color : '#f0f0f0',
            color: tab === t.id ? '#fff' : '#555',
            transition: 'all .15s',
          }}>{t.label}</button>
        ))}
      </div>

      <div className="content" style={{ paddingTop: 16 }}>
        {tab === 'admin' && <PanelAdmin />}
        {tab === 'ing'   && <PanelIngenieria />}
        {tab === 'prod'  && <PanelProduccion />}
        {tab === 'externo' && <PanelExterno />}
        {tab === 'calidad' && <PanelCalidad />}
        <Glosario />
      </div>
    </div>
  )
}
