import { common } from './common'

/** English → Spanish dictionary for /admin/dump-truck/sqcdp (Safety/Quality/Cost/Delivery/People monthly review). */
export const sqcdpDict: Record<string, string> = {
  ...common,

  'SQCDP Monthly Review': 'Revisión Mensual SQCDP',
  'Safety 30% · Quality 20% · Cost 20% · Delivery 20% · People 10%. GREEN 90-100, YELLOW 80-89, RED below 80. Safety is the gate.':
    'Seguridad 30% · Calidad 20% · Costo 20% · Entrega 20% · Personal 10%. VERDE 90-100, AMARILLO 80-89, ROJO menos de 80. Seguridad es la condición de entrada.',
  '← Back to Dump Truck Setup': '← Volver a Configuración de Camión Volquete',

  "Couldn't load this month's review": 'No se pudo cargar la revisión de este mes',
  'Try again': 'Intentar de nuevo',
  'Scorecard: {error}': 'Tarjeta de puntuación: {error}',

  'Fleet SQCDP Score': 'Puntuación SQCDP de la Flota',
  '🚨 Safety is RED — this is the gate. Review Safety Pareto and open a corrective action before anything else.':
    '🚨 Seguridad está en ROJO — esta es la condición de entrada. Revisa el Pareto de Seguridad y abre una acción correctiva antes que cualquier otra cosa.',

  'Overall Trend': 'Tendencia General',
  'Fleet SQCDP score, last {n} months. Green/yellow/red bands mark the same 90/80 thresholds as the scorecard.':
    'Puntuación SQCDP de la flota, últimos {n} meses. Las bandas verde/amarillo/rojo marcan los mismos umbrales 90/80 que la tarjeta de puntuación.',

  '{computable} of {total} KPIs tracked': '{computable} de {total} indicadores rastreados',
  'target': 'meta',
  'Raise a corrective action': 'Abrir una acción correctiva',
  '+ Action': '+ Acción',

  'At/above baseline': 'En/sobre la línea base',
  'Target set': 'Meta establecida',
  'Downtrend': 'Tendencia a la baja',
  'Tracked monthly': 'Rastreado mensualmente',

  'Safety Pareto': 'Pareto de Seguridad',
  'Safety-critical / out-of-service defects, by category': 'Defectos críticos de seguridad / fuera de servicio, por categoría',
  'Delivery Pareto': 'Pareto de Entrega',
  'Delay minutes by reported reason': 'Minutos de retraso por motivo reportado',
  'Quality Pareto': 'Pareto de Calidad',
  'No document-error or destination-accuracy tracking source yet.': 'Aún no hay una fuente de datos para errores de documentos o exactitud de destino.',
  'Cost Pareto': 'Pareto de Costo',
  'No billing/revenue or expense-category tracking source yet.': 'Aún no hay una fuente de datos para facturación/ingresos o categorías de gasto.',
  'People Pareto': 'Pareto de Personal',
  'No training/communication tracking source yet.': 'Aún no hay una fuente de datos para capacitación o comunicación.',
  'No events this month.': 'No hay eventos este mes.',
  'defects': 'defectos',
  'minutes': 'minutos',
  'TOP 80%': 'TOP 80%',

  'Incentive Preview': 'Vista Previa de Incentivo',
  'Not implemented — no incentive rules/results engine exists yet (spec §12/§13). Driver compensation today is the hourly/per-mile pay policy on the Dump Truck Setup page, unrelated to SQCDP scoring.':
    'No implementado — aún no existe un motor de reglas/resultados de incentivos (spec §12/§13). La compensación del conductor hoy es la política de pago por hora/por milla en la página de Configuración de Camión Volquete, sin relación con la puntuación SQCDP.',

  'Corrective Action Register': 'Registro de Acciones Correctivas',
  '({count} overdue)': '({count} vencidas)',
  '+ New Action': '+ Nueva Acción',
  'No corrective actions this month.': 'No hay acciones correctivas este mes.',
  'Due {date}': 'Vence {date}',
  'Owner': 'Responsable',
  'Priority': 'Prioridad',
  'Source': 'Fuente',
  'Cause': 'Causa',
  'low': 'Baja',
  'medium': 'Media',
  'high': 'Alta',

  'Open': 'Abierto',
  'In Progress': 'En Progreso',
  'Blocked': 'Bloqueado',
  'Ready to Verify': 'Listo para Verificar',
  'Closed': 'Cerrado',
  'Marked {status}': 'Marcado como {status}',
  'Could not update action': 'No se pudo actualizar la acción',

  'Category': 'Categoría',
  'Owner (one named person — required)': 'Responsable (una persona designada — requerido)',
  'Due Date': 'Fecha de Vencimiento',
  'Problem': 'Problema',
  'Corrective Action': 'Acción Correctiva',
  'Create Action': 'Crear Acción',
  'Problem, action, owner, and due date are required': 'Se requieren problema, acción, responsable y fecha de vencimiento',
  'Corrective action created': 'Acción correctiva creada',
  'Could not create action': 'No se pudo crear la acción',

  'GREEN': 'VERDE',
  'YELLOW': 'AMARILLO',
  'RED': 'ROJO',
  'NO DATA': 'SIN DATOS',

  'Could not load this page — check your connection and try again': 'No se pudo cargar esta página — verifica tu conexión e intenta de nuevo',
}
