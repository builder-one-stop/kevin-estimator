export default function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-btn ${className}`.trim()} aria-label={label} {...props}>{children}</button>
}
