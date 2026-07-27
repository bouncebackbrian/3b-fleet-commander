import { describe, it, expect } from 'vitest'
import { buildCsv } from './csv'

interface Row { name: string; amount: number; note: string | null }

describe('buildCsv', () => {
  it('builds a header row plus one row per record', () => {
    const csv = buildCsv<Row>(
      [{ name: 'A', amount: 1, note: null }, { name: 'B', amount: 2.5, note: 'ok' }],
      [
        { header: 'Name', value: r => r.name },
        { header: 'Amount', value: r => r.amount },
        { header: 'Note', value: r => r.note },
      ],
    )
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Name,Amount,Note')
    expect(lines[1]).toBe('A,1,')
    expect(lines[2]).toBe('B,2.5,ok')
  })

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const csv = buildCsv<Row>(
      [{ name: 'Smith, John "Big Rig"', amount: 1, note: 'line1\nline2' }],
      [{ header: 'Name', value: r => r.name }, { header: 'Note', value: r => r.note }],
    )
    const lines = csv.trim().split('\r\n')
    expect(lines[1]).toBe('"Smith, John ""Big Rig""","line1\nline2"')
  })

  it('produces just a header row for an empty dataset', () => {
    const csv = buildCsv<Row>([], [{ header: 'Name', value: r => r.name }])
    expect(csv).toBe('Name\r\n')
  })
})
