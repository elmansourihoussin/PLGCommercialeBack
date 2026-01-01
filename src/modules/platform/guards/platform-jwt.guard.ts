import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class PlatformJwtGuard extends AuthGuard('platform-jwt') {}
