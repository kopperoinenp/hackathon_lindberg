import test from "node:test";
import assert from "node:assert/strict";
import { assessCooperation } from "../backend/cooperation.mjs";
test("relationship description is assessed with a strict traffic-light response", async () => {
  const description =
    "Toimitukset ovat toistuvasti myöhässä ja asiakas harkitsee sopimuksen lopettamista.";
  const result = await assessCooperation(
    { description },
    {
      generate: async (request) => {
        assert.equal(JSON.parse(request.input).description, description);
        assert.deepEqual(request.schema.properties.status.enum, [
          "green",
          "yellow",
          "red",
          "unrated",
        ]);
        return {
          status: "red",
          reason: "Toistuvat viiveet ja sopimuksen jatkumisen riski vaativat toimenpiteitä.",
        };
      },
    },
  );
  assert.equal(result.status, "red");
  assert.match(result.reason, /viiveet/);
});
test("invalid descriptions never call the provider and invalid output never becomes an assessment", async () => {
  for (const input of [
    {},
    { description: "" },
    { description: " " },
    { description: "x".repeat(2001) },
  ])
    await assert.rejects(
      assessCooperation(input, {
        generate: () => {
          throw new Error("must not run");
        },
      }),
    );
  for (const output of [
    { status: "blue", reason: "wrong" },
    { status: "green", reason: "" },
    { status: "yellow", reason: "x".repeat(401) },
  ])
    await assert.rejects(
      assessCooperation({ description: "Asiakkaan palaute" }, { generate: async () => output }),
    );
  await assert.rejects(
    assessCooperation(
      { description: "Tilanne" },
      {
        generate: async () => {
          throw new Error("provider unavailable");
        },
      },
    ),
    /provider unavailable/,
  );
});
