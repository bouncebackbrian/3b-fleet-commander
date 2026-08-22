import { common } from './common'

/** English → Spanish dictionary for /admin/dump-truck/safety (incident reports & defect escalations). */
export const safetyDict: Record<string, string> = {
  ...common,

  'Safety': 'Seguridad',
  'Truck defect escalations and driver-reported incidents in one place. Setup for sites and jobs moved to the':
    'Escalaciones de defectos de camiones e incidentes reportados por conductores, todo en un solo lugar. La configuración de sitios y trabajos se movió a la página',
  'Sites & Jobs': 'Sitios y Trabajos',
  ' page.': '.',

  'Incidents': 'Incidentes',
  '({count} urgent)': '({count} urgentes)',
  'No incidents reported.': 'No se han reportado incidentes.',

  'Collision': 'Colisión',
  'Property Damage': 'Daño a la Propiedad',
  'Near Miss': 'Casi Accidente',
  'Injury': 'Lesión',
  'Spill': 'Derrame',
  'Equipment Failure': 'Falla de Equipo',
  'Other': 'Otro',

  'Safe': 'Seguro',
  'Needs Assistance': 'Necesita Asistencia',
  'Emergency': 'Emergencia',

  'reported by {name}': 'reportado por {name}',
  'Safety status': 'Estado de seguridad',
  '⚠ Injuries reported': '⚠ Lesiones reportadas',
  'Police': 'Policía',
  '🚓 {agency} report {number}': '🚓 reporte de {agency} {number}',
  '📷 View Photo': '📷 Ver Foto',
  '📍 Scene Location': '📍 Ubicación del Incidente',
  "📍 Driver's Location": '📍 Ubicación del Conductor',
  'Could not load photo': 'No se pudo cargar la foto',

  'Monitor': 'Monitorear',
  'Non-Safety': 'No Relacionado con Seguridad',
  'Safety-Critical': 'Crítico de Seguridad',
  'Out of Service': 'Fuera de Servicio',

  'Tires': 'Llantas',
  'Brakes': 'Frenos',
  'Lights': 'Luces',
  'Hydraulics': 'Hidráulica',
  'Engine': 'Motor',
  'Electrical': 'Eléctrico',
  '🔧 {count} trucks need {category} work ({units}) — consider booking one appointment to save a call.':
    '🔧 {count} camiones necesitan trabajo de {category} ({units}) — considera programar una sola cita para ahorrar una llamada.',

  'Open Defects': 'Defectos Abiertos',
  'No open defects.': 'No hay defectos abiertos.',
  'Show resolved': 'Mostrar resueltos',

  '🚫 {unit} is on a dispatch hold{reason}. Driver cannot start custody until released.':
    '🚫 {unit} está en espera de despacho{reason}. El conductor no puede iniciar la custodia hasta que se libere.',

  'Downtime': 'Tiempo Fuera de Servicio',
  'running': 'en curso',
  'open': 'abierto',
  'acknowledged': 'reconocido',
  'resolved': 'resuelto',
  'deferred': 'diferido',
  'Arrived': 'Llegó',
  'Left/Done': 'Salió/Completado',
  'Resolution': 'Resolución',

  "Who's handling it — shop, tow company, mobile tech…": 'Quién se encarga — taller, grúa, técnico móvil…',
  'Not yet assigned': 'Aún sin asignar',
  'Assigned to': 'Asignado a',
  'Change': 'Cambiar',
  'Assign': 'Asignar',

  'Resolution notes (optional)': 'Notas de resolución (opcional)',
  'Confirm Resolved': 'Confirmar Resuelto',
  'Why is this truck being placed on hold? (required)': '¿Por qué se está poniendo este camión en espera? (requerido)',
  'Place on Hold': 'Poner en Espera',
  'What details are you requesting from the driver? (required)': '¿Qué detalles estás solicitando al conductor? (requerido)',
  'Send Request': 'Enviar Solicitud',
  'Instruction for the driver — e.g. "daylight only until repaired" (required)':
    'Instrucción para el conductor — ej. "solo de día hasta que se repare" (requerido)',
  'Release Hold': 'Liberar Espera',

  '🚗 Mark Arrived': '🚗 Marcar Llegada',
  '❓ Request Details': '❓ Solicitar Detalles',
  '✅ Mark Operable / Release Hold': '✅ Marcar Operable / Liberar Espera',
  '🚫 Place Truck on Hold': '🚫 Poner Camión en Espera',
  '✅ Mark Left / Done': '✅ Marcar Salida / Completado',
  'Defer': 'Diferir',
  '↩️ Reopen': '↩️ Reabrir',

  'Truck placed on hold': 'Camión puesto en espera',
  'Truck hold released': 'Espera del camión liberada',
  'Defect resolved': 'Defecto resuelto',
  'Defect acknowledged': 'Defecto reconocido',
  'Details requested': 'Detalles solicitados',
  'Defect assigned': 'Defecto asignado',
  'Defect reopened': 'Defecto reabierto',
  'Defect deferred': 'Defecto diferido',
  'Defect updated': 'Defecto actualizado',
  'Could not update defect': 'No se pudo actualizar el defecto',
}
