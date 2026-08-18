import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { BeneficiaryDto } from './dto'

// Carnet d'adresses des proches au Bénin (fonctionnalité diaspora).
@Injectable()
export class BeneficiariesService {
  constructor(private prisma: PrismaService) {}

  list(clientId: string) {
    return this.prisma.beneficiary.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } })
  }

  create(clientId: string, dto: BeneficiaryDto) {
    return this.prisma.beneficiary.create({ data: { ...dto, clientId } })
  }

  async update(clientId: string, id: string, dto: BeneficiaryDto) {
    await this.assertOwned(clientId, id)
    return this.prisma.beneficiary.update({ where: { id }, data: dto })
  }

  async remove(clientId: string, id: string) {
    await this.assertOwned(clientId, id)
    await this.prisma.beneficiary.delete({ where: { id } })
    return { ok: true }
  }

  // Utilisé par la création de commande : garantit que le proche appartient au client.
  async getOwned(clientId: string, id: string) {
    return this.assertOwned(clientId, id)
  }

  private async assertOwned(clientId: string, id: string) {
    const b = await this.prisma.beneficiary.findUnique({ where: { id } })
    if (!b) throw new NotFoundException('Proche introuvable.')
    if (b.clientId !== clientId) throw new ForbiddenException('Accès refusé.')
    return b
  }
}
