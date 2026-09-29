import { describe, expect, it } from 'vitest'
import { buildProposalPdf } from './proposalPdf.js'

describe('client proposal PDF', () => {
  it('paginates long content and prints only sale prices', () => {
    const estimate = {
      id: '12345678-1111-1111-1111-111111111111', title: 'Bathroom work', created_at: '2026-09-28T00:00:00Z', markup_bps: 3600,
      client: { name: 'Client' }, project: { address: 'Los Angeles, CA' },
      document: { sections: [{ id: 's', title: 'Demolition', items: [{ id: 'i', description: 'Remove finishes', quantity: 1, unit: 'lot', unitCost: 100 }] }],
        proposal: { intro: 'Thank you. '.repeat(900), scope: '', notes: '', exclusions: '', terms: '' } },
    }
    const pdf = buildProposalPdf(estimate)
    const output = pdf.output()
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    expect(output).toContain('TOTAL PROPOSAL')
    expect(output).toContain('$136.00')
    expect(output).not.toContain('$100.00')
    expect(output).not.toContain('Unit cost')
    expect(output).not.toContain('Markup')
  })
})
