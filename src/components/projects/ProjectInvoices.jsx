import { ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function ProjectInvoices({ compact = false }) {
  const { t } = useTranslation()
  return <section className={`workspace-section ${compact ? 'workspace-section-compact' : ''}`}>
    <div className="workspace-section-head"><h2>{t('workspace.invoices')}</h2></div>
    <div className="workspace-empty"><ReceiptText size={22} /><div><b>{t('workspace.noInvoices')}</b><p>{t('workspace.noInvoicesDetail')}</p></div></div>
  </section>
}
