import { Global, Module } from '@nestjs/common'
import { GeoService } from './geo.service'
import { SettingsService } from './settings.service'

@Global()
@Module({
  providers: [GeoService, SettingsService],
  exports: [GeoService, SettingsService],
})
export class CommonModule {}
