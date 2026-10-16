import { buildApprovedPdf } from './approvedProposalPdf.js'
// Both entry points render the same persisted document, including manual estimates.
export const buildProposalPdf = (estimate, options) => buildApprovedPdf(estimate, options)
export function downloadProposalPdf(estimate, options) {
 const pdf=buildProposalPdf(estimate,options)
 pdf.save(`${estimate.id.slice(0,8)}-${estimate.document.language||'en'}-r${estimate.version}.pdf`)
 return pdf
}
