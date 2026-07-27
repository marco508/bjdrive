import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as Sentry from '@sentry/node'
import compression from 'compression'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { UPLOAD_DIR } from './common/upload'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  // Supervision des erreurs (activée uniquement si SENTRY_DSN est défini).
  const sentryDsn = config.get<string>('SENTRY_DSN')
  if (sentryDsn) {
    Sentry.init({ dsn: sentryDsn, environment: config.get('NODE_ENV') || 'development' })
  }

  // En-têtes de sécurité. crossOriginResourcePolicy relâché pour servir les
  // images /uploads au front (origine différente).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  // Derrière un reverse proxy (nginx, Traefik...) : IP réelle pour le rate limiting.
  app.set('trust proxy', 1)

  // Compression gzip de toutes les réponses — essentiel pour économiser la data
  // sur les connexions lentes/limitées (contexte Afrique de l'Ouest).
  app.use(compression())

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  )

  // Photos produits/enseignes uploadées (mettre un volume sur UPLOAD_DIR en prod).
  app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/', maxAge: '30d', immutable: true })

  const origins = (config.get<string>('CORS_ORIGIN') || '*').split(',').map((s) => s.trim())
  app.enableCors({ origin: origins.includes('*') ? true : origins, credentials: true })

  const port = Number(config.get('PORT')) || 3007
  await app.listen(port)
  new Logger('Bootstrap').log(`API BjDrive démarrée sur http://localhost:${port}/api`)
}
bootstrap()
