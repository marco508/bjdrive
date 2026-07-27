import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { imageUploadOptions } from '../common/upload'
import { StoresService } from './stores.service'
import { CreateStoreDto, UpdateStoreDto, ProductDto, ImportProductsDto, UpdateProductDto } from './dto'

@Controller()
export class StoresController {
  constructor(private stores: StoresService) {}

  // -------- Public --------
  @Get('categories')
  categories() {
    return this.stores.categories()
  }

  // Recherche produit multi-enseignes (public) : /products/search?q=riz&lat=..&lng=..
  @Get('products/search')
  searchProducts(@Query('q') q: string, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    return this.stores.searchProducts(q || '', lat ? Number(lat) : undefined, lng ? Number(lng) : undefined)
  }

  @Get('stores')
  list(
    @Query('categoryId') categoryId?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    return this.stores.listPublic({
      categoryId,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      radius: radius ? Number(radius) : undefined,
    })
  }

  // -------- Manager : mes boutiques (avant :id) --------
  @Get('stores/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  mine(@CurrentUser('userId') userId: string) {
    return this.stores.listMine(userId)
  }

  @Get('stores/mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  getMine(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.stores.getMine(userId, id)
  }

  @Get('stores/:id')
  getPublic(@Param('id') id: string) {
    return this.stores.getPublic(id)
  }

  @Post('stores')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateStoreDto) {
    return this.stores.createStore(userId, dto)
  }

  @Patch('stores/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  update(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.updateStore(userId, id, dto)
  }

  // -------- Produits (manager) --------
  @Post('stores/:id/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  addProduct(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ProductDto) {
    return this.stores.addProduct(userId, id, dto)
  }

  @Post('stores/:id/products/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  importProducts(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ImportProductsDto) {
    return this.stores.importProducts(userId, id, dto)
  }

  @Patch('products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  updateProduct(@CurrentUser('userId') userId: string, @Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.stores.updateProduct(userId, productId, dto)
  }

  // -------- Photos (enseigne / produit) --------
  @Post('stores/:id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadStoreImage(@CurrentUser('userId') userId: string, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ "file").')
    return this.stores.setStoreImage(userId, id, `/uploads/${file.filename}`)
  }

  @Post('products/:productId/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadProductImage(@CurrentUser('userId') userId: string, @Param('productId') productId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ "file").')
    return this.stores.setProductImage(userId, productId, `/uploads/${file.filename}`)
  }

  @Delete('products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MANAGER)
  removeProduct(@CurrentUser('userId') userId: string, @Param('productId') productId: string) {
    return this.stores.removeProduct(userId, productId)
  }
}
