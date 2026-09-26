import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { CircleGauge, Flag, History, ReceiptText, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Chip from '../components/ui/Chip.jsx'
import Composer from '../components/chat/Composer.jsx'
import { LogoMark } from '../components/layout/Sidebar.jsx'

const suggestions = [
  [ReceiptText, 'var(--danger)'], [Flag, '#F0A030'], [CircleGauge, 'var(--lime)'], [TrendingUp, '#3BAFDA'],
]

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showSoon } = useOutletContext()
  const [draft, setDraft] = useState('')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('greet.morning') : hour < 19 ? t('greet.afternoon') : t('greet.evening')
  const send = () => navigate(`/chat/${Date.now()}`, { state: { prompt: draft.trim() } })

  return (
    <div className="home">
      <div className="home-top"><Chip onClick={showSoon}><History size={18} />{t('history')}</Chip></div>
      <div className="home-center">
        <LogoMark size={56} />
        <h1 className="greet">{greeting}, Kevin</h1>
        <div className="suggest">
          {t('suggest', { returnObjects: true }).map((label, index) => {
            const [Icon, color] = suggestions[index]
            return <button type="button" key={label} onClick={() => setDraft(label)}><span style={{ color }}><Icon size={24} /></span>{label}</button>
          })}
        </div>
      </div>
      <Composer value={draft} onChange={setDraft} onSend={send} onSoon={showSoon} />
    </div>
  )
}
