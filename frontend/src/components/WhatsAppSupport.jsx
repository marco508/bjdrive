import { supportWhatsAppUrl } from '../config.js'
import Icon from './Icon.jsx'

// Lien vers le support WhatsApp — « il y a un humain joignable ».
// Ne s'affiche que si VITE_SUPPORT_WHATSAPP est configuré au build.
export default function WhatsAppSupport({ text, label = 'Une question ? Écrivez-nous sur WhatsApp', variant = 'card' }) {
  const url = supportWhatsAppUrl(text)
  if (!url) return null

  if (variant === 'inline') {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>
        {label}
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#e7f8ee', display: 'grid', placeItems: 'center' }}>
        <Icon name="chat" size={20} color="#1faa5a" />
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span>
      <Icon name="chevronRight" size={20} color="var(--muted)" />
    </a>
  )
}
