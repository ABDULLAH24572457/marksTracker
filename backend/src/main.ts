import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = Number(
    process.env.PORT ?? configService.get<number>('port', 3000),
  );
  const frontendUrl = configService.get<string>(
    'frontendUrl',
    'http://localhost:5173',
  );

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: frontendUrl,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
}

void bootstrap();
