import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import { GlobalExceptionFilter } from "./errors/global-exception.filter"
import { validationExceptionFactory } from "./errors/validation-exception.factory"
import cookieParser from "cookie-parser"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  app.use(cookieParser(configService.get<string>("COOKIE_SECRET") ?? undefined))

  /* --------------------------- */
  /* ✅ Global Exception Filter
   *
   * Converts all exceptions into a consistent ApiErrorBody format.
   * Handles Prisma errors, validation errors, and generic HTTP exceptions.
   */
  app.useGlobalFilters(new GlobalExceptionFilter())

  /* --------------------------- */
  /* ✅ Enable validation for all incoming data
   *
   * This helps prevent invalid or unexpected data from reaching the logic.
   * - `whitelist`: removes any extra properties that are not defined in the DTOs (Data Transfer Objects)
   * - `forbidNonWhitelisted`: throws an error if the client sends unexpected properties
   * - `transform`: automatically converts input data to the correct types (e.g., string to number)
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  /* --------------------------- */
  /* 🌍 Allow requests from other websites (CORS)
   *
   * This is needed if the frontend app is hosted on a different domain.
   * - `origin`: only allow requests from the specified website (from an environment variable)
   * - `credentials`: allows cookies or authorization headers to be included in requests
   */
  const origins = configService.getOrThrow<string>("CORS_ORIGIN")

  app.enableCors({
    origin: origins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  })

  /* --------------------------- */
  /* 📘 Set up Swagger API documentation
   *
   * This generates a webpage where developers can see and test all the API endpoints.
   * It also adds login support using Keycloak and OAuth2, so people can try protected endpoints.
   */
  const keycloakBaseUrl = configService.getOrThrow<string>("KEYCLOAK_BASE_URL")
  const keycloakRealm = configService.getOrThrow<string>("KEYCLOAK_REALM")
  const keycloakClientId =
    configService.getOrThrow<string>("KEYCLOAK_CLIENT_ID")
  const keycloakClientSecret = configService.getOrThrow<string>(
    "KEYCLOAK_CLIENT_SECRET",
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Jump API") // Title shown on the Swagger page
    .setDescription("Generated with @nestjs/swagger") // Optional description
    .setVersion("1.0.0") // API version
    // 🔐 OAuth2 Login (for using Swagger with Keycloak login)
    .addOAuth2({
      type: "oauth2",
      flows: {
        authorizationCode: {
          // Where Swagger should redirect users to log in
          authorizationUrl: `${keycloakBaseUrl}/realms/${keycloakRealm}/protocol/openid-connect/auth`,
          // Where Swagger should send the login code to exchange it for a token
          tokenUrl: `${keycloakBaseUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`,
          scopes: {
            openid: "openid",
            profile: "profile",
          },
        },
      },
    })
    // 🛡️ (OPTIONAL) Also allow testing endpoints with a Bearer Token (JWT)
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "JWT",
    )
    .build()

  /* --------------------------- */
  // Create the final Swagger document
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  // 🔐 Apply OAuth2 as the default auth method in Swagger (includes Bearer token support)
  // Ensures the access token is included in requests to secured endpoints
  document.security = [{ oauth2: [] }]

  // Define where the app is running (used for OAuth2 redirect)
  const port = parseInt(configService.getOrThrow<string>("PORT"), 10)
  const appOrigin = configService.getOrThrow<string>("APP_ORIGIN")

  /* --------------------------- */
  // 💻 Setup Swagger UI at the `/docs` URL
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: {
      oauth2RedirectUrl: `${appOrigin}/docs/oauth2-redirect.html`,
      persistAuthorization: true, // Keep user logged in when page reloads
      initOAuth: {
        clientId: keycloakClientId,
        clientSecret: keycloakClientSecret,
        usePkceWithAuthorizationCodeGrant: true,
        scopes: ["openid", "profile"],
        additionalQueryStringParams: {
          prompt: "login", // Always show login prompt for a different account
        },
      },
    },
  })

  /* --------------------------- */
  /* 🚀 Start the app on the configured port
   *
   * Uses the port from .env (PORT).
   */
  await app.listen(port)
}

void bootstrap()
