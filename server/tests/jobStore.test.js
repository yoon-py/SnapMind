const test = require("node:test");
const assert = require("node:assert/strict");

const { createJobStore } = require("../stores/jobStore");

test("job store creates and removes jobs", () => {
  const store = createJobStore();
  return (async () => {
    const job = await store.create("job-1");

    assert.equal(job.status, "generating");
    assert.equal(await store.get("job-1"), job);

    await store.remove("job-1");

    assert.equal(await store.get("job-1"), null);
  })();
});
