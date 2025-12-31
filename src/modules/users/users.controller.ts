import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateMyPasswordDto } from './dto/update-my-password.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me/password')
  @Roles(Role.OWNER, Role.ADMIN, Role.AGENT)
  updateMyPassword(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateMyPasswordDto,
  ) {
    return this.usersService.updateMyPassword(tenantId, user.id, dto);
  }

  @Patch('me')
  @Roles(Role.OWNER, Role.ADMIN, Role.AGENT)
  updateMe(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMe(tenantId, user.id, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  list(@TenantId() tenantId: string, @Query() query: ListUsersQueryDto) {
    return this.usersService.list(tenantId, query);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Patch(':id/password')
  @Roles(Role.OWNER, Role.ADMIN)
  updatePassword(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserPasswordDto,
  ) {
    return this.usersService.updatePassword(tenantId, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.ADMIN)
  updateStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.usersService.remove(tenantId, id);
  }
}
