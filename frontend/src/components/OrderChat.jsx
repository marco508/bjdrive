import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { api } from '../services/api.js'
import { trackOrder } from '../services/realtime.js'

const ROLE_LABEL = { CLIENT: 'Client', MANAGER: 'Enseigne', STAFF: 'Enseigne', DRIVER: 'Livreur', SUPERADMIN: 'BjDrive' }

// Discussion privée d'une commande : client + personnel de l'enseigne + livreur.
// Temps réel via Socket.IO (chatMessage), repliable pour ne pas envahir l'écran.
export default function OrderChat({ orderId, startOpen = false }) {
  const { user, showToast } = useApp()
  const [open, setOpen] = useState(startOpen)
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef(null)
  const openRef = useRef(startOpen)
  openRef.current = open

  useEffect(() => {
    let alive = true
    api.orderMessages(orderId).then((m) => alive && setMessages(m)).catch(() => alive && setMessages([]))
    const unsub = trackOrder(orderId, {
      onChat: (m) => {
        setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev))
        if (!openRef.current) setUnread((u) => u + 1)
      },
    })
    return () => {
      alive = false
      unsub()
    }
  }, [orderId])

  useEffect(() => {
    if (open) {
      setUnread(0)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages?.length])

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const m = await api.sendOrderMessage(orderId, body)
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev))
      setText('')
    } catch (err) {
      showToast('Erreur : ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', border: 'none', background: 'none', padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700, color: 'inherit' }}
      >
        <span>💬 Discussion de la commande</span>
        {unread > 0 && <span className="badge red">{unread} nouveau{unread > 1 ? 'x' : ''}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages === null && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Chargement…</p>}
            {messages?.length === 0 && (
              <p className="muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>
                Posez une question sur votre commande — l'enseigne et le livreur vous répondent ici.
              </p>
            )}
            {(messages || []).map((m) => {
              const mine = m.senderId === user?.id
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  {!mine && (
                    <div className="muted" style={{ fontSize: 11, margin: '0 0 2px 4px' }}>
                      {ROLE_LABEL[m.senderRole] || ''} · {m.sender?.name}
                    </div>
                  )}
                  <div
                    style={{
                      background: mine ? 'var(--green)' : 'var(--green-soft)',
                      color: mine ? '#fff' : 'var(--ink)',
                      padding: '8px 12px',
                      borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      fontSize: 14,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.body}
                  </div>
                  <div className="muted" style={{ fontSize: 10, margin: '2px 4px 0', textAlign: mine ? 'right' : 'left' }}>
                    {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un message…" maxLength={1000} style={{ flex: 1 }} />
            <button className="btn small" disabled={busy || !text.trim()}>Envoyer</button>
          </form>
        </div>
      )}
    </div>
  )
}
