import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { History, MessageSquare, X, ArrowUpRight } from 'lucide-react'
import { aiRequest } from '../../services/ai.js'
import { compactTitle } from '../../../shared/chatPresentation.js'
import { useAiText, errorText } from './strings.js'
import '../../styles/ai.css'

export default function HistoryDrawer() {
  const { a, language } = useAiText()
  const dialog = useRef(null), trigger = useRef(null)
  const [open, setOpen] = useState(false), [rows, setRows] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    const node = dialog.current
    node.showModal()
    let active = true
    aiRequest('conversations').then(data => { if (active) { setRows(data); setError('') } }).catch(e => { if (active) setError(e.code) })
    return () => { active = false; node.close() }
  }, [open, retry])
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
  return <>
    <button ref={trigger} type="button" className="history-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog"><History size={18} />{a('historyButton')}</button>
    {open && <dialog ref={dialog} className="history-drawer" aria-label={a('historyButton')} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current && event.clientX < dialog.current.getBoundingClientRect().left) close() }}>
      <header><div><span className="home-eyebrow">One Stop</span><h2>{a('historyButton')}</h2></div><button type="button" className="icon-btn" aria-label={a('close')} onClick={close}><X size={22} /></button></header>
      <p className="muted">{a('historyHelp')}</p>
      {error ? <p role="alert">{errorText(error, a)} <button className="text-action" onClick={() => setRetry(x => x + 1)}>{a('retry')}</button></p> : !rows ? <p role="status">{a('loading')}</p> : rows.length ? <nav aria-label={a('historyButton')}>{rows.slice(0,30).map(row => <Link key={row.id} to={`/chat/${row.id}`} onClick={close}><MessageSquare size={18} /><span><b>{compactTitle(row.title)}</b><time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span><ArrowUpRight size={16} /></Link>)}</nav> : <p>{a('historyEmpty')}</p>}
      <Link className="btn btn-ghost history-all" to="/chat" onClick={close}>{a('allConversations')}<ArrowUpRight size={16} /></Link>
    </dialog>}
  </>
}
