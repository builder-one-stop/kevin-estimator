import {useTranslation} from 'react-i18next'
import {localSalesEnabled} from '../services/sales.js'
import Followups from '../components/projects/Followups.jsx'
export default function Schedule(){const {i18n}=useTranslation(),es=i18n.language.startsWith('es');return <div className="page"><h1>{es?'Agenda interna':'Internal schedule'}</h1>{localSalesEnabled?<Followups/>:<p>{es?'Agenda en revisión local aislada. No hay calendario remoto activado.':'Schedule is under isolated local review. No remote calendar is activated.'}</p>}</div>}
