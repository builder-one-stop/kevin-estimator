import { MapPin, Phone, Plus, SortDesc, Upload } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CONTACTS } from '../mocks/data.js'
import Button from '../components/ui/Button.jsx'
import Chip from '../components/ui/Chip.jsx'
import IconButton from '../components/ui/IconButton.jsx'

export default function Contacts() {
  const { t } = useTranslation()
  const { showSoon } = useOutletContext()
  return (
    <div className="page">
      <div className="page-head"><h1>{t('contacts.title')}</h1><div className="head-actions"><IconButton label={t('contacts.import')} onClick={showSoon}><Upload size={18} /></IconButton><Button onClick={showSoon}><Plus size={18} />{t('contacts.add')}</Button></div></div>
      <div className="filters"><Chip>{t('contacts.all')}<span className="count">{CONTACTS.length}</span></Chip><span className="spacer" /><Chip><SortDesc size={16} />{t('a11y.sortName')}</Chip></div>
      <div className="rows">{CONTACTS.map((contact) => (
        <div className="row row-contacts" key={contact.name}>
          <div className="who"><span className="avatar">{contact.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><b>{contact.name}</b><span className="tag">{t('contacts.client')}</span></div>
          <span className="cell-ic"><Phone size={18} /><span>{contact.phone}</span></span>
          <span className="cell-ic"><MapPin size={18} /><span>{contact.address || t('contacts.noAddress')}</span></span>
        </div>
      ))}</div>
    </div>
  )
}
