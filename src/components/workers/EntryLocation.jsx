import { useTranslation } from 'react-i18next'
import { formatWorkerTime } from '../../../shared/workerTime.js'
import { locationMapUrl,lowAccuracyMeters } from '../../../shared/workerLocation.js'
export default function EntryLocation({shift}) {
 const {t,i18n}=useTranslation(),location=shift.entry_location,url=locationMapUrl(location)
 if(!url)return <p className="worker-location muted">{t(shift.entry_source==='admin'?'workers.location.admin':'workers.location.missing')}</p>
 const corrected=shift.events?.find(e=>e.kind==='in')?.at
 return <section className="worker-location" aria-label={t('workers.location.title')}>
  <h4>{t('workers.location.title')}</h4>
  <p>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
  <p>{t('workers.location.accuracy',{meters:new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1}).format(location.accuracy)})}{location.accuracy>lowAccuracyMeters&&<> · <strong>{t('workers.location.lowAccuracy')}</strong></>}</p>
  {shift.entry_recorded_at&&<p>{t('workers.location.official')}: {formatWorkerTime(shift.entry_recorded_at,i18n.language)}</p>}
  <p>{t('workers.location.deviceTime')}: {formatWorkerTime(location.capturedAt,i18n.language)}</p>
  {corrected&&shift.entry_recorded_at&&Date.parse(corrected)!==Date.parse(shift.entry_recorded_at)&&<p>{t('workers.location.original')}</p>}
  <small>{t('workers.location.reported')}</small><p><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('workers.location.map')}</a></p>
 </section>
}
