import { useState } from 'react'

// Guide de prise en main, étape par étape, affiché à la PREMIÈRE connexion
// de chaque rôle (mémorisé en local). Relançable depuis « Mon compte ».
const GUIDES = {
  CLIENT: [
    { ic: '👋', title: 'Bienvenue sur BjDrive !', text: 'Faites vos courses dans des enseignes vérifiées près de chez vous et faites-vous livrer à domicile. Voici comment ça marche, en 1 minute.' },
    { ic: '📍', title: 'Trouvez vos enseignes', text: 'Autorisez la localisation : nous affichons les supermarchés, kiosques et pharmacies les plus proches. Vous pouvez aussi rechercher un produit précis pour comparer les prix entre enseignes.' },
    { ic: '🧺', title: 'Remplissez votre panier', text: 'Ajoutez des produits — même de plusieurs enseignes à la fois. Un seul livreur fera la tournée et vous livrera tout en une seule fois.' },
    { ic: '💳', title: 'Payez comme vous voulez', text: 'Mobile Money, Moov Money, carte bancaire… ou en espèces à la réception. Le total inclut les produits et les frais de livraison & service, sans surprise.' },
    { ic: '🛵', title: 'Suivez votre livreur en direct', text: 'Après la commande, suivez la position du livreur sur la carte en temps réel avec son heure d’arrivée estimée. Vous pouvez l’appeler à tout moment.' },
    { ic: '🔐', title: 'Le code de réception', text: 'Un code à 4 chiffres s’affiche dans votre suivi. Communiquez-le au livreur UNIQUEMENT à la remise de vos courses : c’est votre preuve de livraison. Ensuite, notez votre expérience ⭐.' },
  ],
  DRIVER: [
    { ic: '👋', title: 'Bienvenue, livreur BjDrive !', text: 'Gagnez de l’argent en livrant les commandes des enseignes proches de vous. Voici l’essentiel avant votre première course.' },
    { ic: '🛡️', title: 'Vérification du compte', text: 'L’équipe BjDrive doit valider votre profil (identité, entretien) avant votre première course. Renseignez votre téléphone dans votre profil pour être contacté rapidement.' },
    { ic: '📡', title: 'Activez votre position', text: 'Partagez votre position pour voir les commandes proches et permettre aux clients de vous suivre. Activez aussi les notifications pour être prévenu des nouvelles courses, même app fermée.' },
    { ic: '🏪', title: 'Acceptez et récupérez', text: 'Choisissez une course (gain affiché à l’avance). Passez dans chaque enseigne de la tournée et pointez chaque retrait. Le badge 📦 indique qu’une commande est prête.' },
    { ic: '🔐', title: 'Livrez et validez', text: 'À la remise, demandez au client son code de réception à 4 chiffres et saisissez-le : c’est ce qui valide la livraison et vos gains. Pour les commandes 💵 espèces, encaissez le montant indiqué.' },
    { ic: '💰', title: 'Vos gains', text: 'Vous gardez 100 % des frais de livraison. Suivez vos gains du jour et des 30 derniers jours sur votre tableau de bord. Un plafond de courses par jour s’applique — pour livrer bien, pas trop.' },
  ],
  MANAGER: [
    { ic: '👋', title: 'Bienvenue sur BjDrive !', text: 'Vendez vos produits en ligne et faites-les livrer par nos livreurs vérifiés. Voici comment ouvrir votre boutique, en 1 minute.' },
    { ic: '🏪', title: 'Créez votre enseigne', text: 'Renseignez le nom, la catégorie, l’adresse et positionnez-la sur la carte. L’équipe BjDrive la vérifie (visite ou appel vidéo) avant qu’elle soit visible des clients — c’est ce qui fait la confiance.' },
    { ic: '🏷️', title: 'Ajoutez produits et stocks', text: 'Ajoutez vos articles un à un ou importez-les en masse. Ajoutez des photos : les produits illustrés se vendent mieux. Les stocks se décomptent automatiquement à chaque commande.' },
    { ic: '🧾', title: 'Préparez les commandes', text: 'Quand une commande payée arrive, vous êtes notifié. Préparez-la puis appuyez sur « Marquer comme prête » : le livreur est prévenu et passe la récupérer.' },
    { ic: '💸', title: 'Vos reversements', text: 'Le montant de vos produits vous revient à 100 % : BjDrive prend sa commission côté client. Renseignez vos coordonnées Mobile Money dans votre compte pour recevoir vos versements.' },
  ],
}

const KEY = (role) => `bjdrive_onboard_${role}`

export function resetOnboarding(role) {
  try {
    localStorage.removeItem(KEY(role))
  } catch {}
}

export default function Onboarding({ role }) {
  const steps = GUIDES[role]
  const [visible, setVisible] = useState(() => {
    try {
      return !!steps && !localStorage.getItem(KEY(role))
    } catch {
      return false
    }
  })
  const [step, setStep] = useState(0)

  if (!visible || !steps) return null
  const s = steps[step]
  const last = step === steps.length - 1

  function close() {
    try {
      localStorage.setItem(KEY(role), '1')
    } catch {}
    setVisible(false)
  }

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true">
      <div className="onboard-card">
        <div className="onboard-ic">{s.ic}</div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="onboard-dots">
          {steps.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} onClick={() => setStep(i)} />
          ))}
        </div>
        <div className="onboard-actions">
          {!last && (
            <button className="btn ghost small" onClick={close}>
              Passer
            </button>
          )}
          <button className="btn" style={{ flex: 1 }} onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? "C'est parti 🚀" : 'Suivant ›'}
          </button>
        </div>
      </div>
    </div>
  )
}
