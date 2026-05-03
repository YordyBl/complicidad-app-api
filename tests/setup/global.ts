// Global test setup for Complicidad Backend
//
// ⚠️ Environment variables MUST be set at the top level (not in beforeAll)
//    because env.ts evaluates at import time. The setupFiles array in
//    vitest.config.ts ensures this file runs before any test module is
//    loaded, but only its top-level statements execute before imports.
//    Hooks like beforeAll run later, AFTER test file imports resolve.
//
// Integration/E2E tests will add database bootstrap, fixtures, etc.
// in their own setup files.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
process.env.PORT = '0'; // random port for supertest
