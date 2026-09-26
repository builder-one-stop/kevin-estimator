export default function Chip({ children, className = '', ...props }) {
  return <button className={`chip ${className}`.trim()} {...props}>{children}</button>
}
