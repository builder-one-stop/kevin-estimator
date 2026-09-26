import { Menu } from 'lucide-react'
import IconButton from '../ui/IconButton.jsx'
import { LogoMark } from './Sidebar.jsx'

export default function MobileBar({ label, onOpen }) {
  return (
    <div className="mobile-bar">
      <IconButton label={label} onClick={onOpen}><Menu /></IconButton>
      <LogoMark size={26} />
      <b>One Stop</b>
    </div>
  )
}
