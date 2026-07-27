import { Global, Injectable, Logger, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { PrismaService } from '../prisma/prisma.service'

// Envoi d'e-mails (factures). Sans SMTP configuré, le service loggue et n'envoie
// rien — l'application fonctionne normalement.
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail')
  private transporter: nodemailer.Transporter | null = null

  constructor(private prisma: PrismaService, private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT')) || 587,
        secure: Number(this.config.get('SMTP_PORT')) === 465,
        auth: this.config.get('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      })
    } else {
      this.logger.warn('SMTP_HOST absent → envoi d’e-mails désactivé (factures logguées uniquement).')
    }
  }

  private fcfa(n: number) {
    return `${Number(n || 0).toLocaleString('fr-FR')} FCFA`
  }

  // Lien de réinitialisation de mot de passe (valable 30 minutes).
  async sendPasswordReset(to: string, name: string, link: string) {
    const html = `
<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#12211a;">
  <div style="background:#0a7d3c;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;">
    <div style="font-size:22px;font-weight:800;">🛒🛵 BjDrive</div>
    <div style="opacity:.9;font-size:13px;">Réinitialisation de votre mot de passe</div>
  </div>
  <div style="border:1px solid #e7ede9;border-top:none;border-radius:0 0 14px 14px;padding:24px;">
    <p>Bonjour ${name},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe BjDrive. Cliquez sur le bouton ci-dessous (valable <strong>30 minutes</strong>) :</p>
    <p style="text-align:center;margin:22px 0;">
      <a href="${link}" style="background:#0a7d3c;color:#fff;text-decoration:none;padding:14px 26px;border-radius:12px;font-weight:700;display:inline-block;">
        Choisir un nouveau mot de passe
      </a>
    </p>
    <p style="color:#6b7c73;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail — votre mot de passe restera inchangé.</p>
  </div>
</div>`
    if (!this.transporter) {
      this.logger.log(`Réinitialisation (SMTP absent, non envoyée) → ${to} : ${link}`)
      return
    }
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM') || 'BjDrive <no-reply@bjdrive.bj>',
      to,
      subject: 'Réinitialisez votre mot de passe BjDrive',
      html,
    })
    this.logger.log(`E-mail de réinitialisation envoyé à ${to}`)
  }

  // Facture nominative : nom du client, enseigne(s), articles, totaux.
  // La commission n'apparaît pas en ligne séparée : elle est incluse dans
  // « Livraison & service » (détail disponible dans l'application).
  async sendInvoice(orderId: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          client: { select: { name: true, email: true } },
          items: true,
          stores: { include: { store: { select: { name: true, address: true } } } },
        },
      })
      if (!order) return
      const storeNames = order.stores.map((os) => os.store.name).join(', ')
      const ref = order.id.slice(-8).toUpperCase()
      const fees = order.deliveryFee + order.commission
      const rows = order.items
        .map(
          (it) =>
            `<tr><td style="padding:6px 0;">${it.emoji || ''} ${it.name}${order.stores.length > 1 ? ` <span style="color:#6b7c73;font-size:12px;">(${it.storeName})</span>` : ''} × ${it.qty}</td><td align="right">${this.fcfa(it.price * it.qty)}</td></tr>`,
        )
        .join('')
      const html = `
<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#12211a;">
  <div style="background:#0a7d3c;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;">
    <div style="font-size:22px;font-weight:800;">🛒🛵 BjDrive</div>
    <div style="opacity:.9;font-size:13px;">Facture — commande n° ${ref}</div>
  </div>
  <div style="border:1px solid #e7ede9;border-top:none;border-radius:0 0 14px 14px;padding:24px;">
    <p style="margin:0 0 4px;"><strong>Client :</strong> ${order.client.name}</p>
    <p style="margin:0 0 4px;"><strong>Enseigne${order.stores.length > 1 ? 's' : ''} :</strong> ${storeNames}</p>
    <p style="margin:0 0 16px;color:#6b7c73;font-size:13px;">
      ${new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      · ${order.fulfillment === 'PICKUP' ? 'Retrait à l’enseigne' : 'Livraison à domicile'}
      · ${order.paymentMethod === 'CASH' ? 'Paiement en espèces' : 'Paiement KkiaPay'}
    </p>
    <table width="100%" style="border-collapse:collapse;font-size:14px;">
      ${rows}
      <tr><td colspan="2" style="border-top:1px solid #e7ede9;padding-top:8px;"></td></tr>
      <tr><td style="padding:4px 0;color:#6b7c73;">Sous-total produits</td><td align="right">${this.fcfa(order.subtotal)}</td></tr>
      ${fees > 0 ? `<tr><td style="padding:4px 0;color:#6b7c73;">Livraison &amp; service</td><td align="right">${this.fcfa(fees)}</td></tr>` : ''}
      <tr><td style="padding:8px 0;font-weight:800;font-size:16px;">Total payé</td><td align="right" style="font-weight:800;font-size:16px;color:#075c2c;">${this.fcfa(order.total)}</td></tr>
    </table>
    <p style="color:#6b7c73;font-size:12px;margin-top:18px;">
      Merci pour votre confiance 🙏 — le détail complet est disponible dans votre application BjDrive, rubrique « Commandes ».
    </p>
  </div>
</div>`
      if (!this.transporter) {
        this.logger.log(`Facture ${ref} (SMTP absent, non envoyée) → ${order.client.email}`)
        return
      }
      await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM') || 'BjDrive <no-reply@bjdrive.bj>',
        to: order.client.email,
        subject: `Votre facture BjDrive — commande n° ${ref} (${this.fcfa(order.total)})`,
        html,
      })
      this.logger.log(`Facture ${ref} envoyée à ${order.client.email}`)
    } catch (e) {
      this.logger.error(`Échec envoi facture ${orderId}`, e as any)
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
