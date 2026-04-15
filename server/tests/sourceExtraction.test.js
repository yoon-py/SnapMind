const test = require("node:test");
const assert = require("node:assert/strict");

const { assessPdfTextCoverage } = require("../lib/sourceExtraction");

function repeatText(label, count = 60) {
  return Array.from({ length: count }, (_, index) => `${label} sentence ${index + 1}.`).join(" ");
}

test("assessPdfTextCoverage accepts dense multi-page extraction", () => {
  const pages = Array.from({ length: 6 }, (_, index) => ({
    num: index + 1,
    text: repeatText(`Chapter ${index + 1}`),
  }));

  const result = assessPdfTextCoverage({
    text: pages.map((page) => page.text).join("\n\n"),
    totalPages: 6,
    pages,
  });

  assert.equal(result.suspicious, false);
});

test("assessPdfTextCoverage flags extraction that stops after early chapters", () => {
  const pages = [
    { num: 1, text: repeatText("Chapter 1") },
    { num: 2, text: repeatText("Chapter 1 continued") },
    { num: 3, text: repeatText("Chapter 2") },
    { num: 4, text: repeatText("Chapter 2 continued") },
    { num: 5, text: "" },
    { num: 6, text: "" },
    { num: 7, text: " " },
    { num: 8, text: "" },
  ];

  const result = assessPdfTextCoverage({
    text: pages.map((page) => page.text).join("\n\n"),
    totalPages: 8,
    pages,
  });

  assert.equal(result.suspicious, true);
  assert.match(result.reasons.join(" | "), /meaningful pages|sparse trailing pages|sparse or empty/);
});
