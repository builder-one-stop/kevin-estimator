import Button from './Button.jsx'

export default function EmptyState({ icon: Icon, title, description, cta, onAction }) {
  return (
    <div className="empty">
      <span className="circle"><Icon size={26} /></span>
      <b className="empty-title">{title}</b>
      <p>{description}</p>
      <Button onClick={onAction}>{cta}</Button>
    </div>
  )
}
