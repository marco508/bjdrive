import { NestFactory } from '@nestjs/core'
import { ValidationPipe, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import compression from 'compression'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  // Compression gzip de toutes les réponses — essentiel pour économiser la data
  // sur les connexions lentes/limitées (contexte Afrique de l'Ouest).
  app.use(compression())

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  )

  const origins = (config.get<string>('CORS_ORIGIN') || '*').split(',').map((s) => s.trim())
  app.enableCors({ origin: origins.includes('*') ? true : origins, credentials: true })

  const port = Number(config.get('PORT')) || 3007
  await app.listen(port)
  new Logger('Bootstrap').log(`API BjDrive démarrée sur http://localhost:${port}/api`)
}
bootstrap()
