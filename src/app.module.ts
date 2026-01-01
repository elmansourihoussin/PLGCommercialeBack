import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { ChequesModule } from './modules/cheques/cheques.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    ClientsModule,
    QuotesModule,
    InvoicesModule,
    ChequesModule,
    ArticlesModule,
    NotificationsModule,
    PlatformModule,
    BillingModule,
    DashboardModule,
  ],
})
export class AppModule {}
