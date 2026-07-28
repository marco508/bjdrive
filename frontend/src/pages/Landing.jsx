import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { supportWhatsAppUrl } from '../config.js'

const ROLES = [
  { role: 'client', icon: 'shoppingCart', title: 'Je commande', desc: 'Faites vos courses et livrez-vous à domicile' },
  { role: 'manager', icon: 'storefront', title: "Je gère une enseigne", desc: 'Ajoutez votre boutique, vos produits et stocks' },
  { role: 'driver', icon: 'moped', title: 'Je livre', desc: 'Prenez des livraisons proches de vous' },
]

export default function Landing() {
  const nav = useNavigate()
  return (
    <div className="hero">
      <div>
        <div className="flag-stripe" style={{ borderRadius: 4, overflow: 'hidden', width: 54, marginBottom: 18 }}>
          <i className="g" /><i className="y" /><i className="r" />
        </div>
        <div className="logo">🛒🛵</div>
        <h1>BjDrive</h1>
        <p className="tag">Commandez auprès d'enseignes vérifiées au Bénin et faites-vous livrer — suivi du livreur en temps réel.</p>
        <div className="hero-points">
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="payments" size={18} /> Payez à la livraison — seulement quand c'est dans vos mains</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="verified" size={18} /> Enseignes et livreurs vérifiés un par un par nos équipes</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="localShipping" size={18} /> Suivi GPS du livreur en direct, minute par minute</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="chat" size={18} /> Un humain joignable : discutez avec l'enseigne et le livreur</span>
        </div>
      </div>

      <div>
        {ROLES.map((r) => (
          <button key={r.role} className="role-btn" onClick={() => nav(`/login?role=${r.role}`)}>
            <span className="ic"><Icon name={r.icon} size={26} /></span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
            </div>
            <span style={{ marginLeft: 'auto', opacity: .7, display: 'flex' }}><Icon name="chevronRight" size={22} /></span>
          </button>
        ))}
        {supportWhatsAppUrl() && (
          <p style={{ textAlign: 'center', marginTop: 10 }}>
            <a href={supportWhatsAppUrl('Bonjour BjDrive, j’ai une question 👋')} target="_blank" rel="noreferrer"
              style={{ fontSize: 13, color: '#fff', fontWeight: 700, textDecoration: 'underline' }}>
              Une question ? Écrivez-nous sur WhatsApp
            </a>
          </p>
        )}
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <a onClick={() => nav('/login?role=superadmin')} style={{ fontSize: 12, opacity: .8, cursor: 'pointer', textDecoration: 'underline' }}>
            Espace administrateur
          </a>
        </p>
      </div>
    </div>
  )
}
