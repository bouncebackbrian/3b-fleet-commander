import { common } from './common'

/** English → Spanish dictionary for /admin/dump-truck/recurring-issues. */
export const recurringIssuesDict: Record<string, string> = {
  ...common,

  'Recurring Issues': 'Problemas Recurrentes',
  'How often each physical issue has been logged, grouped from the last 100 defect reports across the fleet — same data as the driver-facing override report, rolled up for corrective-action tracking instead of per-shift dispatch. See per-truck and per-driver breakdowns on the':
    'Con qué frecuencia se ha registrado cada problema físico, agrupado a partir de los últimos 100 reportes de defectos de toda la flota — los mismos datos que el reporte de anulación que ve el conductor, consolidados para el seguimiento de acciones correctivas en lugar del despacho por turno. Consulta el desglose por camión y por conductor en la página',
  'Fleet KPIs': 'Indicadores de la Flota',
  ' page.': '.',
  '← Back to Dump Truck Setup': '← Volver a Configuración de Camión Volquete',

  'Loading…': 'Cargando…',

  'Recurring ({count})': 'Recurrentes ({count})',
  'No issue has been logged more than once yet.': 'Aún no se ha registrado ningún problema más de una vez.',
  'Trucks': 'Camiones',
  'First seen': 'Primera vez visto',
  'Last seen': 'Última vez visto',

  'Logged Once ({count})': 'Registrado una Vez ({count})',

  'Monitor': 'Monitorear',
  'Non-Safety': 'No Relacionado con Seguridad',
  'Safety-Critical': 'Crítico de Seguridad',
  'Out of Service': 'Fuera de Servicio',

  '{count} open': '{count} abierto(s)',
}
