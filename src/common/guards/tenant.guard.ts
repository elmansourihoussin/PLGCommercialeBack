import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../interfaces/request-user';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    const headerTenantId = request.header('x-tenant-id');

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    if (headerTenantId && headerTenantId !== user.tenantId) {
      throw new ForbiddenException('Cross-tenant access blocked');
    }

    request['tenantId'] = user.tenantId;
    return true;
  }
}
