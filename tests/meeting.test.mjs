import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/mockups/kopperoinenp/meeting-model.js";
const model = globalThis.MeetingModel;
test("onboarding distinguishes an explicitly chosen default from an unstarted customer", () => {
  assert.equal(model.parseBrief(null), null);
  assert.equal(model.parseBrief("invalid"), null);
  assert.equal(model.parseBrief('{"completed":false,"goal":"Vesi"}'), null);
  assert.deepEqual(model.parseBrief('{"completed":true,"goal":""}'), { goal: "" });
  assert.deepEqual(model.parseBrief('{"completed":true,"goal":"Ilmasto"}'), { goal: "Ilmasto" });
  assert.equal(model.goalFocus("", "neutral").priority, "neutral");
});
test("meeting goals select a relevant priority without inventing financial data", () => {
  assert.equal(model.goalFocus("Päästöjen pienentäminen", "water").priority, "emissions");
  assert.equal(model.goalFocus("Asiakassuhteen vahvistaminen", "water").priority, "water");
  assert.match(model.goalFocus("Kustannusten säästö euroissa", "water").gap, /ei voida osoittaa/);
});
test("presentation selection retains evidence and respects insight order", () => {
  assert.deepEqual(model.slideIds(["emissions", "water", "repairs"], ["water", "opportunity"]), [
    "cover",
    "water",
    "opportunity",
    "plan",
    "sources",
    "limits",
  ]);
  assert.deepEqual(model.slideIds(["water"], []), ["cover", "plan", "sources", "limits"]);
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
