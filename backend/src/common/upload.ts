import { BadRequestException } from '@nestjs/common'
import { diskStorage } from 'multer'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { extname } from 'path'

// Upload d'images (produits, enseignes) sur le disque local, servi par /uploads.
// En production, monter un volume sur UPLOAD_DIR pour conserver les fichiers.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const imageUploadOptions = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
      cb(null, UPLOAD_DIR)
    },
    filename: (_req: any, file: any, cb: any) => {
      const ext = extname(file.originalname || '').toLowerCase() || '.jpg'
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 Mo — data mobile oblige
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new BadRequestException('Format non supporté (JPEG, PNG ou WebP uniquement).'), false)
    }
    cb(null, true)
  },
}
