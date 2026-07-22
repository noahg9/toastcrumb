import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  if (!process.env.JWT_SECRET?.trim()) throw new Error("JWT_SECRET env var is not set");
  // Google OAuth (Story 7.2). These two have no sensible default — fail fast so
  // a misconfigured deploy crashes early with a clear message rather than at the
  // first Google sign-in. GOOGLE_CALLBACK_URL / WEB_APP_URL have code defaults.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars are not set");

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  });

  const port = Number(process.env.PORT ?? 4000);
  // Bind to 0.0.0.0 (not the default host) so container platforms like
  // Railway/Fly can reach the app for routing and health checks.
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`toastcrumb api listening on 0.0.0.0:${port}/api`);
}

void bootstrap();
