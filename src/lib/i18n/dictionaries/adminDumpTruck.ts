import { common } from './common'

/** English → Spanish dictionary for /admin/dump-truck (Dump Truck Mode — Setup). */
export const adminDumpTruckDict: Record<string, string> = {
  ...common,

  // ── Page header ────────────────────────────────────────────────────────
  'Dump Truck Mode — Setup': 'Modo Camión Volquete — Configuración',
  'Minimal setup screens for sites and jobs so drivers can run a full day. Trucks/trailers come from the existing fleet equipment registry — add them there first if the lists below are empty. The full geocoding/map-pin location directory (spec §6) is a follow-up build, not included here. Open defect escalations and incident reports moved to the':
    'Pantallas mínimas de configuración de sitios y trabajos para que los conductores puedan completar un día completo. Los camiones/remolques provienen del registro de equipo de la flota existente — agrégalos ahí primero si las listas de abajo están vacías. El directorio completo de ubicaciones con geolocalización/pines de mapa (spec §6) es una compilación futura, no incluida aquí. Las escalaciones de defectos abiertas y los reportes de incidentes se movieron a la página',
  'Safety': 'Seguridad',
  'page. To send a driver a job/location for a specific day, use':
    'Para enviar a un conductor un trabajo/ubicación para un día específico, usa',
  'Dispatch — Send Job': 'Despacho — Enviar Trabajo',

  // ── SitesPanel ─────────────────────────────────────────────────────────
  'Sites ({count})': 'Sitios ({count})',
  '✨ AI Fill from Screenshot or Location': '✨ Llenado con IA desde Captura de Pantalla o Ubicación',
  '✨ AI Fill': '✨ Llenado con IA',
  'Screenshot a maps app pin (Apple/Google Maps), or type/paste coordinates or a description — fills the fields below for you to review before saving.':
    'Toma una captura de pantalla de un pin en una app de mapas (Apple/Google Maps), o escribe/pega coordenadas o una descripción — llena los campos de abajo para que los revises antes de guardar.',
  '📷 Upload Screenshot': '📷 Subir Captura de Pantalla',
  'or corner of Heaven Hill Way & Conestoga Dr, Carson City NV': 'o esquina de Heaven Hill Way & Conestoga Dr, Carson City NV',
  'Fill': 'Llenar',
  'Type': 'Tipo',
  'Latitude': 'Latitud',
  'Longitude': 'Longitud',
  'Geofence (m)': 'Geocerca (m)',
  'Add Site': 'Agregar Sitio',
  'City/State': 'Ciudad/Estado',
  'Coords': 'Coordenadas',
  '✓ Verified': '✓ Verificado',
  '⚠ Unverified': '⚠ Sin Verificar',
  'Address/GPS not yet confirmed with dispatch': 'Dirección/GPS aún no confirmados con despacho',
  'Fields filled — review before saving': 'Campos llenados — revisa antes de guardar',
  'Could not read screenshot': 'No se pudo leer la captura de pantalla',
  'Could not parse location': 'No se pudo analizar la ubicación',
  'Site name is required': 'El nombre del sitio es obligatorio',
  'Could not create site': 'No se pudo crear el sitio',
  'Site created': 'Sitio creado',

  // site type values
  'yard': 'patio',
  'pickup': 'recogida',
  'dump': 'descarga',
  'customer': 'cliente',
  'fuel': 'combustible',
  'maintenance': 'mantenimiento',
  'scale': 'báscula',
  'disposal': 'disposición',
  'parking': 'estacionamiento',
  'other': 'otro',

  // ── PendingDealsPanel ──────────────────────────────────────────────────
  'Pending Broker Deals ({count})': 'Tratos Pendientes con Corredores ({count})',
  'Everything else came from the broker — pick a driver and truck (closest truck to pickup is pre-selected) and accept.':
    'Todo lo demás vino del corredor — elige un conductor y un camión (el camión más cercano a la recogida está preseleccionado) y acepta.',
  'Material n/a': 'Material n/d',
  'pickup n/a': 'recogida n/d',
  'dump n/a': 'descarga n/d',
  'Truck (closest first)': 'Camión (más cercano primero)',
  '(no location yet)': '(sin ubicación aún)',
  'Accepting…': 'Aceptando…',
  'Accept & Assign': 'Aceptar y Asignar',
  'Pick a driver and truck first': 'Primero elige un conductor y un camión',
  'Could not accept deal': 'No se pudo aceptar el trato',
  '{job} scheduled': '{job} programado',

  // ── JobsPanel ──────────────────────────────────────────────────────────
  'Jobs ({count})': 'Trabajos ({count})',
  'Freight Bill #': 'N.º de Factura de Flete',
  'Est. Quantity (daily goal)': 'Cantidad Estimada (meta diaria)',
  'Quantity Unit': 'Unidad de Cantidad',
  'Tons': 'Toneladas',
  'Cubic Yards': 'Yardas Cúbicas',
  'Units': 'Unidades',
  'Truck Type': 'Tipo de Camión',
  'Pickup Site': 'Sitio de Recogida',
  'Dump Site': 'Sitio de Descarga',
  'Select…': 'Seleccionar…',
  'Dispatch Ticket Details': 'Detalles del Boleto de Despacho',
  'Load Time': 'Hora de Carga',
  'Order Date': 'Fecha del Pedido',
  'Delivery Date': 'Fecha de Entrega',
  'Ordered By': 'Pedido Por',
  'Cosignee': 'Consignatario',
  'Phone Number': 'Número de Teléfono',
  'Travel Time (min)': 'Tiempo de Viaje (min)',
  'Fuel Surcharge ($)': 'Recargo de Combustible ($)',
  'Price Per Hour ($)': 'Precio Por Hora ($)',
  'Price Per Ton ($)': 'Precio Por Tonelada ($)',
  'Material Cost ($)': 'Costo del Material ($)',
  'Directions': 'Instrucciones de Ruta',
  'Add Job': 'Agregar Trabajo',
  'Job #': 'Trabajo N.º',
  '🎫 Ticket': '🎫 Boleto',
  'Job number is required': 'El número de trabajo es obligatorio',
  'Could not create job': 'No se pudo crear el trabajo',
  'Job created': 'Trabajo creado',

  // job status values
  'proposed': 'propuesto',
  'draft': 'borrador',
  'scheduled': 'programado',
  'active': 'activo',
  'completed': 'completado',
  'cancelled': 'cancelado',

  // ── TicketTemplatesPanel ───────────────────────────────────────────────
  'Dispatch Ticket Templates': 'Plantillas de Boleto de Despacho',
  'Choose which fields show on the digital dispatch ticket and whether it requires a company/driver signature — per broker, or the generic Fleet Commander default used for jobs with no broker.':
    'Elige qué campos se muestran en el boleto de despacho digital y si requiere firma de la empresa/conductor — por corredor, o el predeterminado genérico de Fleet Commander usado para trabajos sin corredor.',
  'Template For': 'Plantilla Para',
  'Fleet Commander (Generic)': 'Fleet Commander (Genérico)',
  'Template Name': 'Nombre de la Plantilla',
  'Fields Shown On Ticket': 'Campos Mostrados en el Boleto',
  'Requires company sign-off': 'Requiere aprobación de la empresa',
  'Requires driver signature': 'Requiere firma del conductor',
  'Save Template': 'Guardar Plantilla',
  'Could not save template': 'No se pudo guardar la plantilla',
  'Ticket template saved': 'Plantilla de boleto guardada',

  // ── PayPolicyFields / PayPolicyPanel ──────────────────────────────────
  'Pay Type': 'Tipo de Pago',
  'Hourly + Daily OT': 'Por Hora + Tiempo Extra Diario',
  'Per-Mile': 'Por Milla',
  'Greater of Hourly or Revenue Share': 'El Mayor Entre Por Hora o Reparto de Ingresos',
  'Rate Per Mile ($)': 'Tarifa Por Milla ($)',
  'Minimum Hourly Rate ($)': 'Tarifa Mínima Por Hora ($)',
  'Base Hourly Rate ($)': 'Tarifa Base Por Hora ($)',
  'Overtime Basis': 'Base del Tiempo Extra',
  'Daily — OT past a threshold each day': 'Diaria — Tiempo extra al superar un umbral cada día',
  'Weekly — OT past a threshold for the week': 'Semanal — Tiempo extra al superar un umbral en la semana',
  'Daily + Weekly — OT past a daily threshold, AND past a weekly threshold':
    'Diaria + Semanal — Tiempo extra al superar un umbral diario, Y al superar un umbral semanal',
  'Weekly OT Threshold (hrs)': 'Umbral Semanal de Tiempo Extra (hrs)',
  'Daily OT Threshold (hrs)': 'Umbral Diario de Tiempo Extra (hrs)',
  'OT Multiplier': 'Multiplicador de Tiempo Extra',
  'Revenue Share (%)': 'Reparto de Ingresos (%)',
  'Dispatch Minimum (hrs)': 'Mínimo de Despacho (hrs)',

  'Driver Hours — Estimated Pay Policy': 'Horas del Conductor — Política de Pago Estimado',
  'Business default — powers the "Estimated Earnings" figures on the driver hours portal for any driver without their own override below. Hourly (daily- or weekly-threshold OT) or a flat per-mile rate. This is':
    'Predeterminado del negocio — impulsa las cifras de "Ganancias Estimadas" en el portal de horas del conductor para cualquier conductor sin su propia anulación configurada abajo. Por hora (con umbral de tiempo extra diario o semanal) o una tarifa fija por milla. Esto',
  'not': 'no',
  'a full payroll engine: per-load/per-ton/detention rates, double-time, and payroll approval are not implemented.':
    'es un motor de nómina completo: las tarifas por carga/tonelada/detención, el tiempo doble y la aprobación de nómina no están implementados.',
  'Currently using the built-in default (not yet saved for this business).':
    'Actualmente se usa el valor predeterminado incorporado (aún no guardado para este negocio).',
  'Save Default Pay Policy': 'Guardar Política de Pago Predeterminada',
  'Could not save pay policy': 'No se pudo guardar la política de pago',
  'Pay policy saved': 'Política de pago guardada',

  // ── DriverPayOverridesPanel ────────────────────────────────────────────
  'Per-Driver Pay Overrides': 'Anulaciones de Pago Por Conductor',
  'Some drivers can be hourly while others are paid per-mile — set an override here for any driver who shouldn\'t use the business default above.':
    'Algunos conductores pueden ser por hora mientras que otros se pagan por milla — configura una anulación aquí para cualquier conductor que no deba usar el predeterminado del negocio de arriba.',
  'Per-mile — ${rate}/mi': 'Por milla — ${rate}/mi',
  'Greater of ${hourly}/hr or {pct}% of revenue': 'El mayor entre ${hourly}/hr o {pct}% de los ingresos',
  'Hourly — ${hourly}/hr': 'Por hora — ${hourly}/hr',
  'Using business default': 'Usando el predeterminado del negocio',
  'Set Override': 'Configurar Anulación',
  'Reverted to business default': 'Revertido al predeterminado del negocio',
  'Could not remove override': 'No se pudo quitar la anulación',
  'Could not save override': 'No se pudo guardar la anulación',
  'Driver pay override saved': 'Anulación de pago del conductor guardada',
}
