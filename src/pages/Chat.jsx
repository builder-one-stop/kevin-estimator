import { useEffect, useState } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DEFAULT_PROMPT } from '../mocks/data.js'
import { LogoMark } from '../components/layout/Sidebar.jsx'
import IconButton from '../components/ui/IconButton.jsx'
import Chip from '../components/ui/Chip.jsx'
import Button from '../components/ui/Button.jsx'
import Composer from '../components/chat/Composer.jsx'
import EstimateTable from '../components/chat/EstimateTable.jsx'

export default function Chat() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { showSoon } = useOutletContext()
  const prompt = location.state?.prompt || DEFAULT_PROMPT
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 800)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="chat">
      <div className="chat-head">
        <IconButton label={t('back')} onClick={() => navigate('/')}><ArrowLeft size={18} /></IconButton>
        <b>{prompt}</b>
        <Chip onClick={() => navigate('/')}><Plus size={16} />{t('newChat')}</Chip>
      </div>
      <div className="thread">
        <div className="msg-user">{prompt}</div>
        <div className="msg-ai">
          <LogoMark size={28} />
          <div className="body">
            {!ready ? <p className="typing">{t('thinking')}</p> : (
              <>
                <p>{t('aiIntro')}</p>
                <ol className="questions"><li>{t('aiQ1')}</li><li>{t('aiQ2')}</li></ol>
                <EstimateTable />
                <div className="actions">
                  <Button onClick={() => navigate('/projects')}>{t('act.create')}</Button>
                  <Button variant="ghost" onClick={showSoon}>{t('act.edit')}</Button>
                  <Button variant="ghost" onClick={showSoon}>{t('act.pdf')}</Button>
                </div>
                <div className="note">{t('protoNote')}</div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="chat-foot"><Composer compact value={draft} onChange={setDraft} onSend={() => { setDraft(''); showSoon() }} onSoon={showSoon} /></div>
    </div>
  )
}
