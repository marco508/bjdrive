// Discussion privée d'une commande (client + enseigne + livreur), temps réel.
import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { api } from './api'
import { trackOrder } from './realtime'
import { useApp } from './store'
import { C } from './theme'

const ROLE_LABEL = { CLIENT: 'Client', MANAGER: 'Enseigne', STAFF: 'Enseigne', DRIVER: 'Livreur', SUPERADMIN: 'BjDrive' }

export default function ChatBox({ orderId, startOpen = false }) {
  const { user } = useApp()
  const [open, setOpen] = useState(startOpen)
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [unread, setUnread] = useState(0)
  const scrollRef = useRef(null)
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
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [open, messages?.length])

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const m = await api.sendOrderMessage(orderId, body)
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev))
      setText('')
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }}>
        <Text style={{ fontWeight: '700', fontSize: 15 }}>💬 Discussion de la commande</Text>
        {unread > 0 && (
          <View style={{ backgroundColor: '#fdeaec', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: C.red, fontSize: 11, fontWeight: '700' }}>{unread}</Text>
          </View>
        )}
        <Text style={{ marginLeft: 'auto', color: C.muted }}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>
          <ScrollView ref={scrollRef} style={{ maxHeight: 260 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {messages?.length === 0 && (
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>
                Posez une question — l'enseigne et le livreur vous répondent ici.
              </Text>
            )}
            {(messages || []).map((m) => {
              const mine = m.senderId === user?.id
              return (
                <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  {!mine && (
                    <Text style={{ color: C.muted, fontSize: 11, marginLeft: 4, marginBottom: 2 }}>
                      {ROLE_LABEL[m.senderRole] || ''} · {m.sender?.name}
                    </Text>
                  )}
                  <View
                    style={{
                      backgroundColor: mine ? C.green : C.greenSoft,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 14,
                      borderBottomRightRadius: mine ? 4 : 14,
                      borderBottomLeftRadius: mine ? 14 : 4,
                    }}
                  >
                    <Text style={{ color: mine ? '#fff' : C.ink, fontSize: 14 }}>{m.body}</Text>
                  </View>
                </View>
              )
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Écrire un message…"
              placeholderTextColor={C.muted}
              style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: C.ink }}
              maxLength={1000}
            />
            <Pressable onPress={send} disabled={busy || !text.trim()} style={{ backgroundColor: text.trim() ? C.green : '#b7c9bf', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>➤</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}
