/**
 * E2E Test Setup
 * This file runs before all E2E tests
 */

// Load .env file if available (NestJS ConfigModule will also load it, but this ensures it's available early)
try {
  require("dotenv").config()
} catch {
  // dotenv not available, that's okay
}

// Mock Keycloak admin client to avoid ES module issues
// The package exports both default and named exports, so we need to mock both
jest.mock("@keycloak/keycloak-admin-client", () => {
  const mockClient = jest.fn().mockImplementation(() => ({
    auth: jest.fn(),
    users: {
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      del: jest.fn(),
      findOne: jest.fn(),
    },
  }))
  
  // Mock both default export and named export
  return {
    __esModule: true,
    default: mockClient,
    KeycloakAdminClient: mockClient,
  }
})

// Increase timeout for E2E tests
jest.setTimeout(30000)

// Mock environment variables if needed
// E2E tests should use real database connection from .env
process.env.NODE_ENV = process.env.NODE_ENV || "test"
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
process.env.RECALL_API_KEY = process.env.RECALL_API_KEY || "test-api-key"
process.env.RECALL_REGION = process.env.RECALL_REGION || "us-west-2"
process.env.RECALL_LEAD_MINUTES = process.env.RECALL_LEAD_MINUTES || "10"
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key"
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
process.env.KEYCLOAK_BASE_URL =
  process.env.KEYCLOAK_BASE_URL || "http://localhost:8080"
process.env.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "jump"
process.env.KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "jump-api"
process.env.KEYCLOAK_CLIENT_SECRET =
  process.env.KEYCLOAK_CLIENT_SECRET || "dev-secret"
// Set KEYCLOAK_BEARER_ONLY=false for tests to allow mock tokens
// Note: This alone doesn't bypass auth - we also override the guards in e2e-module.helper.ts
process.env.KEYCLOAK_BEARER_ONLY = "false"
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key"
process.env.PORT = process.env.PORT || "3001"
process.env.AI_QUEUE_CONCURRENCY = process.env.AI_QUEUE_CONCURRENCY || "2"
process.env.AI_TRANSCRIPT_CHAR_LIMIT =
  process.env.AI_TRANSCRIPT_CHAR_LIMIT || "20000"
process.env.AI_TRANSCRIPT_SEGMENT_LIMIT =
  process.env.AI_TRANSCRIPT_SEGMENT_LIMIT || "75"
process.env.AI_SOCIAL_WORD_LIMIT = process.env.AI_SOCIAL_WORD_LIMIT || "90"
process.env.FACEBOOK_GRAPH_VERSION =
  process.env.FACEBOOK_GRAPH_VERSION || "v19.0"

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
