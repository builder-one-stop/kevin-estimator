import { jsPDF } from 'jspdf'
import { calculateEstimate, proposalPrices } from './estimateDocument.js'

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export function buildProposalPdf(estimate) {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  const left = 52
  const right = width - 52
  const line = 17
  let y = 54
  let page = 1
  const sums = calculateEstimate(estimate.document, estimate.markup_bps)
  const prices = proposalPrices(estimate.document, estimate.markup_bps)

  function pageBreak(needed = line) {
    if (y + needed <= height - 56) return
    pdf.setFontSize(9); pdf.setTextColor(110); pdf.text(`Page ${page}`, right, height - 30, { align: 'right' })
    pdf.addPage(); page += 1; y = 52
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(219, 105, 31)
    pdf.text('ONE STOP  |  CLIENT PROPOSAL', left, 34)
    pdf.setDrawColor(225); pdf.line(left, 42, right, 42)
  }
  function textBlock(value, { size = 10, bold = false, gap = 10, color = [35, 35, 35] } = {}) {
    if (!value) return
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(...color)
    const lines = pdf.splitTextToSize(String(value), right - left)
    for (const row of lines) { pageBreak(line); pdf.text(row, left, y); y += line }
    y += gap
  }
  function heading(value) { pageBreak(36); textBlock(value, { size: 12, bold: true, gap: 5, color: [45, 45, 45] }) }

  pdf.setFillColor(28, 28, 28); pdf.rect(0, 0, width, 12, 'F')
  textBlock('ONE STOP', { size: 18, bold: true, gap: 0, color: [233, 105, 31] })
  textBlock('Building & Remodeling  |  Los Angeles, CA', { size: 9, gap: 18, color: [100, 100, 100] })
  textBlock('ESTIMATE & CLIENT PROPOSAL', { size: 10, bold: true, gap: 10, color: [100, 100, 100] })
  textBlock(estimate.title, { size: 20, bold: true, gap: 12 })
  textBlock(`Prepared for: ${estimate.client?.name || 'Client to be confirmed'}`, { bold: true, gap: 0 })
  textBlock(`Job address: ${estimate.project?.address || estimate.client?.address || 'To be confirmed'}`, { gap: 0 })
  textBlock(`Estimate: ${estimate.id.slice(0, 8).toUpperCase()}  |  ${new Date(estimate.created_at).toLocaleDateString('en-US')}`, { gap: 18, color: [100, 100, 100] })
  const proposal = estimate.document.proposal
  if (proposal.intro) { heading('Introduction'); textBlock(proposal.intro) }
  if (proposal.scope) { heading('Scope of work'); textBlock(proposal.scope) }

  heading('Work and pricing')
  for (const section of estimate.document.sections) {
    pageBreak(42)
    textBlock(section.title || 'Work section', { size: 11, bold: true, gap: 2 })
    for (const item of section.items) {
      const amount = prices.get(item.id) ?? 0
      const label = `${item.description || 'Item'}  |  ${item.quantity} ${item.unit}`
      const rows = pdf.splitTextToSize(label, right - left - 105)
      if (rows.length * line + 8 < height - 112) pageBreak(rows.length * line + 8)
      rows.forEach((row, index) => {
        pageBreak(line + 8)
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(35)
        pdf.text(row, left + 8, y)
        if (index === 0) { pdf.setFont('helvetica', 'bold'); pdf.text(usd(amount), right, y, { align: 'right' }) }
        y += line
      })
      y += 8
    }
    const sectionCents = section.items.reduce((sum, item) => sum + (prices.get(item.id) ?? 0), 0)
    pageBreak(25); pdf.setDrawColor(220); pdf.line(left, y, right, y); y += 17
    pdf.setFont('helvetica', 'bold'); pdf.text('Section total', left + 8, y); pdf.text(usd(sectionCents), right, y, { align: 'right' }); y += 24
  }
  pageBreak(45); pdf.setFillColor(245, 245, 245); pdf.rect(left, y - 14, right - left, 38, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(30)
  pdf.text('TOTAL PROPOSAL', left + 10, y + 10); pdf.text(usd(sums.priceCents), right - 10, y + 10, { align: 'right' }); y += 52
  for (const [label, value] of [['Notes', proposal.notes], ['Exclusions', proposal.exclusions], ['Terms & conditions', proposal.terms]]) {
    if (value) { heading(label); textBlock(value) }
  }
  pdf.setFontSize(9); pdf.setTextColor(110); pdf.text(`Page ${page}`, right, height - 30, { align: 'right' })
  return pdf
}

export function downloadProposalPdf(estimate) {
  const safeName = estimate.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'estimate'
  buildProposalPdf(estimate).save(`${safeName}-proposal.pdf`)
}
