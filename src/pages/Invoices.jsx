import { Plus, SortDesc, UserRound } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { INVOICES } from '../mocks/data.js'
import { formatMoney } from '../lib/money.js'
import Button from '../components/ui/Button.jsx'
import Chip from '../components/ui/Chip.jsx'

export default function Invoices() {
  const { t } = useTranslation()
  const { showSoon } = useOutletContext()
  return (
    <div className="page">
      <div className="page-head"><h1>{t('invoices.title')}</h1><Button onClick={showSoon}><Plus size={18} />{t('invoices.create')}</Button></div>
      <div className="filters"><Chip>{t('invoices.all')}<span className="count">{INVOICES.length}</span></Chip><Chip><UserRound size={16} />{t('invoices.clients')}</Chip><span className="spacer" /><Chip><SortDesc size={16} />{t('projects.sort')}</Chip></div>
      <div className="rows">{INVOICES.map((invoice) => (
        <div className="row row-invoices" key={invoice.num}>
          <div><b>{invoice.name}</b><div className="muted row-note">{invoice.num}</div></div>
          <div className="truncate"><div className="truncate">{invoice.project}</div><div className="link-orange">{invoice.est} {invoice.name}</div></div>
          <span className="cell-ic"><UserRound size={16} /><span>{t('invoices.noClient')}</span></span>
          <span>{invoice.date}</span><b className="money">{formatMoney(invoice.amount)}</b><span className="status">{t('invoices.draft')}</span>
        </div>
      ))}</div>
    </div>
  )
}
