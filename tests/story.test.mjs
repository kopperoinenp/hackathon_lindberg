import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";

const data = globalThis.REVIEW_DATA;
const { defaultPriority, storyContext } = globalThis.StoryModel;

test("customer industry changes the initial story emphasis", () => {
  assert.deepEqual(data.customers.map(defaultPriority), ["water", "efficiency", "circularity"]);
});

test("changing story priority reorders results while preserving the evidence", () => {
  const selection = { customer: "CUST001", site: "all", baseline: "B_LOCAL", priority: "water" };
  const water = storyContext(data, selection);
  const emissions = storyContext(data, { ...selection, priority: "emissions" });
  assert.equal(water.order[0], "water");
  assert.equal(emissions.order[0], "emissions");
  assert.deepEqual(water.metrics, emissions.metrics);
  assert.deepEqual(water.compare, emissions.compare);
  assert.equal(water.focus.site_id, water.sites[0].site_id);
});

test("site story describes the selected site instead of the customer-wide outlier", () => {
  const story = storyContext(data, {
    customer: "CUST001",
    site: "S002",
    baseline: "B_HOME",
    priority: "water",
  });
  assert.equal(story.focus.site_id, "S002");
  assert.equal(story.metrics.sites, 1);
  assert.equal(story.focus.site_name, "NorthStar Turku");
  assert.equal(story.baseline.baseline_id, "B_HOME");
});
