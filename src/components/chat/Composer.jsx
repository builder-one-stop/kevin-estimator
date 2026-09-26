import { ArrowUp, MapPin, Mic, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import IconButton from '../ui/IconButton.jsx'

export default function Composer({ value, onChange, onSend, compact = false, onSoon }) {
  const { t } = useTranslation()
  const placeholder = compact ? t('replyPh') : t('composerPh')
  const submit = () => value.trim() && onSend()

  return (
    <div className="composer">
      <textarea rows={compact ? 1 : 2} value={value} onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
        }}
        placeholder={placeholder} aria-label={placeholder} />
      {!compact && <div className="hint">{t('hint')}</div>}
      <div className="comp-row">
        <IconButton label={t('a11y.attach')} onClick={onSoon}><Plus size={18} /></IconButton>
        <span className="loc"><MapPin size={17} />{t('location')}</span>
        {!compact && (
          <select className="mode" aria-label={t('a11y.mode')}>
            <option value="standard">{t('mode.standard')}</option>
            <option value="insurance">{t('mode.insurance')}</option>
          </select>
        )}
        <span className="spacer" />
        <IconButton label={t('a11y.voice')} onClick={onSoon}><Mic size={18} /></IconButton>
        <button type="button" className="send" aria-label={t('a11y.send')} disabled={!value.trim()} onClick={submit}><ArrowUp size={20} /></button>
      </div>
    </div>
  )
}
