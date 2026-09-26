import { Globe2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SAMPLE_EST, MARKUP_RATE } from '../../mocks/data.js'
import { formatMoney } from '../../lib/money.js'
import { markup, subtotal, total } from '../../lib/estimateMath.js'

export default function EstimateTable() {
  const { t } = useTranslation()
  const sub = subtotal(SAMPLE_EST)
  const markupAmount = markup(sub, MARKUP_RATE)
  const grandTotal = total(sub, markupAmount)

  return (
    <div className="est">
      <div className="est-head"><b>{t('estTitle')} · EST-10018</b><span className="tag"><Globe2 size={14} />{t('estDoc')}</span></div>
      <div className="est-scroll">
        <table>
          <thead><tr><th>{t('th.item')}</th><th className="num">{t('th.qty')}</th><th>{t('th.unit')}</th><th className="num">{t('th.price')}</th><th className="num">{t('th.total')}</th></tr></thead>
          <tbody>
            {SAMPLE_EST.flatMap((section) => [
              <tr className="sec" key={section.sec}><td colSpan="5">{section.sec}</td></tr>,
              ...section.items.map(([description, quantity, unit, unitPrice]) => (
                <tr key={description}><td>{description}</td><td className="num">{quantity}</td><td>{unit}</td><td className="num">{formatMoney(unitPrice)}</td><td className="num">{formatMoney(quantity * unitPrice)}</td></tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="totals">
        <div><span className="muted">{t('subtotal')}</span><span>{formatMoney(sub)}</span></div>
        <div><span className="muted">{t('markup')}</span><span>{formatMoney(markupAmount)}</span></div>
        <div className="grand"><span>{t('total')}</span><span>{formatMoney(grandTotal)}</span></div>
      </div>
    </div>
  )
}
