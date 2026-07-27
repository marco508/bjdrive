import { useNavigate } from 'react-router-dom'

const ROLES = [
  { role: 'client', ic: '🛒', title: 'Je commande', desc: 'Faites vos courses et livrez-vous à domicile' },
  { role: 'manager', ic: '🏪', title: "Je gère une enseigne", desc: 'Ajoutez votre boutique, vos produits et stocks' },
  { role: 'driver', ic: '🛵', title: 'Je livre', desc: 'Prenez des livraisons proches de vous' },
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
          <span>✅ Enseignes et livreurs vérifiés par nos équipes</span>
          <span>📍 Suivi GPS du livreur et heure d'arrivée estimée</span>
          <span>💳 Mobile Money, carte bancaire ou espèces à la livraison</span>
          <span>🔐 Code de réception sécurisé à la remise</span>
        </div>
      </div>

      <div>
        {ROLES.map((r) => (
          <button key={r.role} className="role-btn" onClick={() => nav(`/login?role=${r.role}`)}>
            <span className="ic">{r.ic}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 22, opacity: .7 }}>›</span>
          </button>
        ))}
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <a onClick={() => nav('/login?role=superadmin')} style={{ fontSize: 12, opacity: .8, cursor: 'pointer', textDecoration: 'underline' }}>
            Espace administrateur
          </a>
        </p>
      </div>
    </div>
  )
}
