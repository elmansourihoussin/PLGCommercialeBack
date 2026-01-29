import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { getUploadsDir, getUploadsUrlBase } from '../../common/utils/uploads';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    await this.getTenant(tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
    });
  }

  async updateLogo(tenantId: string, logoUrl: string) {
    const tenant = await this.getTenant(tenantId);

    const base = `${getUploadsUrlBase()}/tenants/`;
    if (tenant.logoUrl?.startsWith(base)) {
      const filename = tenant.logoUrl.replace(base, '');
      const filePath = join(getUploadsDir(), 'tenants', filename);
      await fs.unlink(filePath).catch(() => undefined);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl },
    });
  }

  async getLogoFile(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const base = `${getUploadsUrlBase()}/tenants/`;
    if (!tenant.logoUrl || !tenant.logoUrl.startsWith(base)) {
      throw new NotFoundException('Logo not found');
    }

    const filename = tenant.logoUrl.replace(base, '');
    const filePath = join(getUploadsDir(), 'tenants', filename);
    await fs.stat(filePath).catch(() => {
      throw new NotFoundException('Logo not found');
    });

    const ext = extname(filename).toLowerCase();
    const mimeType =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'application/octet-stream';

    return { path: filePath, filename, mimeType };
  }

  async removeLogo(tenantId: string) {
    const tenant = await this.getTenant(tenantId);

    const base = `${getUploadsUrlBase()}/tenants/`;
    if (tenant.logoUrl?.startsWith(base)) {
      const filename = tenant.logoUrl.replace(base, '');
      const filePath = join(getUploadsDir(), 'tenants', filename);
      await fs.unlink(filePath).catch(() => undefined);
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: null },
    });
  }
}
