import {useTranslation} from 'react-i18next'
import {localSalesEnabled} from '../services/sales.js'
import InternalInvoices from '../components/projects/InternalInvoices.jsx'
export default function Invoices(){const {i18n}=useTranslation(),es=i18n.language.startsWith('es');return <div className="page"><h1>{es?'Facturas internas':'Internal invoices'}</h1>{localSalesEnabled?<InternalInvoices/>:<p>{es?'Facturas persistentes en revisión local aislada. No hay facturas ficticias ni emisión remota activada.':'Persistent invoices are under isolated local review. No mock invoices or remote issuance is enabled.'}</p>}</div>}
