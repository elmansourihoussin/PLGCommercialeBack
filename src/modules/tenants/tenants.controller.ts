import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { getUploadsDir, getUploadsUrlBase } from '../../common/utils/uploads';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  getMe(@TenantId() tenantId: string) {
    return this.tenantsService.getTenant(tenantId);
  }

  @Get('me/logo')
  async getLogo(
    @TenantId() tenantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const logo = await this.tenantsService.getLogoFile(tenantId);
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${logo.filename}"`);
    return new StreamableFile(createReadStream(logo.path));
  }

  @Patch('me')
  updateMe(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateTenant(tenantId, dto);
  }

  @Patch('me/logo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/svg+xml',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Format de fichier non supporte'),
            false,
          );
        }
        return cb(null, true);
      },
      storage: diskStorage({
        destination: async (_req, _file, cb) => {
          const dest = join(getUploadsDir(), 'tenants');
          try {
            await fs.mkdir(dest, { recursive: true });
            cb(null, dest);
          } catch (error) {
            cb(error as Error, dest);
          }
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
    }),
  )
  async uploadLogo(
    @TenantId() tenantId: string,
    @UploadedFile()
    file?: { filename: string; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('Fichier requis');
    }

    const logoUrl = `${getUploadsUrlBase()}/tenants/${file.filename}`;
    return this.tenantsService.updateLogo(tenantId, logoUrl);
  }

  @Delete('me/logo')
  removeLogo(@TenantId() tenantId: string) {
    return this.tenantsService.removeLogo(tenantId);
  }
}
