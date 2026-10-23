import {useTranslation} from 'react-i18next'
import {useOutletContext} from 'react-router-dom'
import {localSalesEnabled} from '../../services/sales.js'
import InternalInvoices from './InternalInvoices.jsx'
export default function ProjectInvoices(){const {project}=useOutletContext(),{i18n}=useTranslation();return localSalesEnabled?<InternalInvoices projectId={project.id}/>:<section className="workspace-section"><h2>{i18n.language==='es'?'Facturas':'Invoices'}</h2><p>{i18n.language==='es'?'Facturación interna disponible solo en revisión local aislada.':'Internal invoicing is available only in isolated local review.'}</p></section>}
