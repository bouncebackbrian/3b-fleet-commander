/**
 * Dump Truck Mode — generic CSV serialization helper
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map(c => escapeCsvField(c.header)).join(',')
  const lines = rows.map(row => columns.map(c => escapeCsvField(c.value(row))).join(','))
  return [header, ...lines].join('\r\n') + '\r\n'
}
