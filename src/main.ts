import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaService } from './common/prisma/prisma.service';
import { getUploadsDir, getUploadsUrlBase } from './common/utils/uploads';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      exceptionFactory: (errors) => {
        const messages: string[] = [];
        const walk = (errs: typeof errors, parentPath = '') => {
          errs.forEach((err) => {
            const path = parentPath
              ? `${parentPath}.${err.property}`
              : err.property;
            if (err.constraints) {
              Object.entries(err.constraints).forEach(([key, message]) => {
                messages.push(`${path}: ${mapConstraint(key, message)}`);
              });
            }
            if (err.children?.length) {
              walk(err.children, path);
            }
          });
        };
        walk(errors);
        return new BadRequestException({ message: messages });
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.use(getUploadsUrlBase(), express.static(getUploadsDir()));

  const config = new DocumentBuilder()
    .setTitle('PLG Commercial API')
    .setDescription('Multi-tenant SaaS backend for quotes and invoices')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

const mapConstraint = (key: string, message: string) => {
  switch (key) {
    case 'isNotEmpty':
      return 'ce champ est obligatoire';
    case 'isEmail':
      return 'email invalide';
    case 'isString':
      return 'doit etre une chaine de caracteres';
    case 'isBoolean':
      return 'doit etre vrai ou faux';
    case 'isNumber':
      return 'doit etre un nombre';
    case 'isDateString':
      return 'date invalide';
    case 'isEnum':
      return 'valeur invalide';
    case 'minLength': {
      const match = message.match(/(\\d+)/);
      return `doit contenir au moins ${match?.[1] ?? 'N'} caracteres`;
    }
    case 'min': {
      const match = message.match(/(-?\\d+\\.?\\d*)/);
      return `doit etre >= ${match?.[1] ?? 'N'}`;
    }
    default:
      return message;
  }
};
