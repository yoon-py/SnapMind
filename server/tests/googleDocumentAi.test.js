const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoogleDocumentAiPageChunks,
  resolveGoogleDocumentAiConfig,
  supportsGoogleDocumentAiMimeType,
} = require("../../shared/backend-core/dist/cjs/googleDocumentAi");

test("resolveGoogleDocumentAiConfig parses explicit env-style values", () => {
  const config = resolveGoogleDocumentAiConfig({
    projectId: "demo-project",
    location: "us",
    processorId: "processor-123",
    clientEmail: "service-account@example.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  });

  assert.equal(config.projectId, "demo-project");
  assert.equal(config.location, "us");
  assert.equal(config.processorId, "processor-123");
  assert.equal(config.clientEmail, "service-account@example.iam.gserviceaccount.com");
  assert.match(config.privateKey, /BEGIN PRIVATE KEY/);
  assert.ok(config.privateKey.includes("\nabc\n"));
});

test("resolveGoogleDocumentAiConfig parses service account json", () => {
  const config = resolveGoogleDocumentAiConfig({
    location: "eu",
    processorId: "processor-456",
    serviceAccountJson: JSON.stringify({
      project_id: "json-project",
      client_email: "json-service@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nxyz\\n-----END PRIVATE KEY-----\\n",
    }),
  });

  assert.equal(config.projectId, "json-project");
  assert.equal(config.location, "eu");
  assert.equal(config.processorId, "processor-456");
  assert.equal(config.clientEmail, "json-service@example.iam.gserviceaccount.com");
});

test("supportsGoogleDocumentAiMimeType recognizes supported document mime types", () => {
  assert.equal(supportsGoogleDocumentAiMimeType("application/pdf"), true);
  assert.equal(supportsGoogleDocumentAiMimeType("image/png"), true);
  assert.equal(supportsGoogleDocumentAiMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), false);
});

test("buildGoogleDocumentAiPageChunks splits large PDFs into 30-page groups", () => {
  assert.deepEqual(buildGoogleDocumentAiPageChunks(0), []);
  assert.deepEqual(buildGoogleDocumentAiPageChunks(12), [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]);
  assert.deepEqual(buildGoogleDocumentAiPageChunks(31), [
    Array.from({ length: 30 }, (_, index) => index + 1),
    [31],
  ]);
  assert.deepEqual(buildGoogleDocumentAiPageChunks(65), [
    Array.from({ length: 30 }, (_, index) => index + 1),
    Array.from({ length: 30 }, (_, index) => index + 31),
    [61, 62, 63, 64, 65],
  ]);
});
