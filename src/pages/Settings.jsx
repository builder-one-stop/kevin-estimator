import {useTranslation} from 'react-i18next'
import {setLanguage} from '../i18n/index.js'
import AiSettings from './AiSettings.jsx'
export default function Settings(){
 const {t,i18n}=useTranslation(),es=i18n.language.startsWith('es')
 return <div className="page"><h1>{t('settings.title')}</h1><section className="ai-card"><h2>{t('settings.lang')}</h2><div className="lang"><button onClick={()=>setLanguage('en')} aria-pressed={!es}>English</button><button onClick={()=>setLanguage('es')} aria-pressed={es}>Español</button></div><p>{es?'El idioma del documento se elige en cada estimado o propuesta. La cuenta y contraseña se administran mediante el administrador autorizado.':'Choose document language on each estimate or proposal. Account and password changes require the authorized administrator.'}</p></section>
 <AiSettings embedded/>
 <section className="ai-card"><h2>{es?'Servicios todavía no disponibles':'Services not available yet'}</h2><p>{es?'Sin sincronización de calendarios, mensajes externos, QuickBooks ni cobros reales. Agenda y facturas internas locales no activan esos servicios. La importación de contactos sigue pendiente.':'No calendar synchronization, external messaging, QuickBooks or real payments. Local internal scheduling and invoices do not activate those services. Contact import remains pending.'}</p></section></div>
}
