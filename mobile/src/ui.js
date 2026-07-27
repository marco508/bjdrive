// Composants UI partagés (charte BjDrive).
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { C } from './theme'

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>
}

export function Btn({ title, onPress, disabled, variant = 'primary', style }) {
  const box = [s.btn, variant === 'outline' && s.btnOutline, variant === 'danger' && s.btnDanger, variant === 'ghost' && s.btnGhost, disabled && s.btnDisabled, style]
  const txt = [s.btnText, (variant === 'outline' || variant === 'ghost') && { color: C.greenDark }]
  return (
    <Pressable style={({ pressed }) => [...box, pressed && !disabled && { opacity: 0.85 }]} onPress={disabled ? undefined : onPress}>
      <Text style={txt}>{title}</Text>
    </Pressable>
  )
}

export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.muted} style={s.input} {...props} />
    </View>
  )
}

export function Badge({ children, tone = 'green' }) {
  const tones = {
    green: { backgroundColor: C.greenSoft, color: C.greenDark },
    yellow: { backgroundColor: '#fff7d6', color: '#8a6d00' },
    red: { backgroundColor: '#fdeaec', color: C.red },
    gray: { backgroundColor: '#eef1f0', color: C.muted },
  }
  const t = tones[tone] || tones.green
  return (
    <View style={[s.badge, { backgroundColor: t.backgroundColor }]}>
      <Text style={{ color: t.color, fontSize: 11, fontWeight: '700' }}>{children}</Text>
    </View>
  )
}

export function Loader({ label = 'Chargement…' }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <ActivityIndicator color={C.green} />
      <Text style={{ color: C.muted, marginTop: 8, fontSize: 13 }}>{label}</Text>
    </View>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <Card style={{ backgroundColor: '#fdeaec' }}>
      <Text style={{ color: C.red, fontSize: 14 }}>{String(error.message || error)}</Text>
      {onRetry ? <Btn title="Réessayer" variant="ghost" style={{ marginTop: 8 }} onPress={onRetry} /> : null}
    </Card>
  )
}

export function Empty({ icon, title, text }) {
  return (
    <View style={{ alignItems: 'center', padding: 40 }}>
      <Text style={{ fontSize: 44 }}>{icon}</Text>
      <Text style={{ fontWeight: '700', fontSize: 16, marginTop: 8 }}>{title}</Text>
      {text ? <Text style={{ color: C.muted, textAlign: 'center', marginTop: 4 }}>{text}</Text> : null}
    </View>
  )
}

export function SectionTitle({ children }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

export function RowBetween({ children, style }) {
  return <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, style]}>{children}</View>
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  btn: {
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.green },
  btnGhost: { backgroundColor: C.greenSoft },
  btnDanger: { backgroundColor: C.red },
  btnDisabled: { backgroundColor: '#b7c9bf' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  fieldLabel: { fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 5 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: C.ink,
  },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.muted,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 8,
  },
})
