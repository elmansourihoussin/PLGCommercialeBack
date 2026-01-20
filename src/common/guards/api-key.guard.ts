import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.header('x-api-key');
    const expected = this.configService.get<string>('SERVICE_API_KEY');

    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
