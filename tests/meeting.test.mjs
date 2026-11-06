import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/meeting-model.js";
const model = globalThis.MeetingModel;
test("presentation selection retains evidence and respects insight order", () => {
  assert.deepEqual(model.slideIds(["emissions", "water", "repairs"], ["water", "opportunity"]), [
    "cover",
    "overview",
    "water",
    "opportunity",
    "plan",
    "sources",
    "limits",
  ]);
  assert.deepEqual(model.slideIds(["water"], []), [
    "cover",
    "overview",
    "plan",
    "sources",
    "limits",
  ]);
});
test("simulated presentation commands distinguish adding notes from selecting insights", () => {
  assert.deepEqual(model.selectionCommand("Poista vesidia esityksestä"), {
    id: "water",
    include: false,
  });
  assert.deepEqual(model.selectionCommand("Lisää päästöt esitykseen"), {
    id: "emissions",
    include: true,
  });
  assert.equal(model.selectionCommand("Miksi vedenkäyttö on tärkeää?"), null);
  assert.equal(model.selectionCommand("Lisää esitykseen: veden säästö on tärkeää"), null);
});
