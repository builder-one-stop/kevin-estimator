import { Building2, ChevronRight, CircleDollarSign, CircleUserRound, FileText, Flag, FolderKanban, Globe2, LayoutGrid, Tags } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n/index.js'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { showSoon, showToast } = useOutletContext()
  const item = (key, Icon) => (
    <button type="button" className="list-item" onClick={showSoon}>
      <Icon /><span className="grow">{t(`settings.${key}`)}<small>{t(`settings.${key}D`)}</small></span><ChevronRight size={18} />
    </button>
  )
  const changeLanguage = async (language) => {
    await setLanguage(language)
    showToast(language === 'es' ? t('toastLang', { lng: 'es' }) : t('toastLang', { lng: 'en' }))
  }

  return (
    <div className="page"><div className="settings">
      <h1>{t('settings.title')}</h1>
      <div className="group-label">{t('settings.groupGeneral')}</div>
      <div className="list">
        <div className="list-item"><Globe2 /><span className="grow">{t('settings.lang')}<small>{t('settings.langD')}</small></span>
          <div className="lang" role="group" aria-label={t('settings.lang')}>
            <button type="button" aria-pressed={i18n.language === 'en'} onClick={() => changeLanguage('en')}>{t('languages.english')}</button>
            <button type="button" aria-pressed={i18n.language === 'es'} onClick={() => changeLanguage('es')}>{t('languages.spanish')}</button>
          </div>
        </div>
        <div className="list-item"><FileText /><span className="grow">{t('settings.docLang')}<small>{t('settings.docLangD')}</small></span><span className="tag">{t('settings.docLangV')}</span></div>
        {item('account', CircleUserRound)}
      </div>
      <div className="group-label">{t('settings.groupBusiness')}</div>
      <div className="list">
        {item('company', Building2)}{item('project', FolderKanban)}{item('cost', Tags)}{item('reminders', Flag)}{item('integrations', LayoutGrid)}{item('payments', CircleDollarSign)}
      </div>
    </div></div>
  )
}
