import { createHash } from "node:crypto";
import { dataset } from "./dataset.mjs";
import { requestContext } from "./request-context.mjs";
import { profileTables, testRecipe } from "./import-analysis.mjs";
import { PresentationError } from "./presentation-model.mjs";

const uploads = new Map();
const recipes = new Map();
const lifetime = 30 * 60 * 1000;
const nonAdditive =
  /allocated_pieces|active_assets_scanned|wearers|inventory|stock|snapshot|percent|pct|ratio|rate|median|average|intensity|target|factor|baseline/i;
function sumUnitsFor(column) {
  if (
    nonAdditive.test(column) ||
    /(^|[\s_-])(id|identifier|code|koodi|tunnus)([\s_-]|$)/i.test(column)
  )
    return [];
  return (
    [
      [/(?:^|_)kwh$|energy_kwh|electricity_kwh/i, ["kWh"]],
      [/kgco2e|co2e_kg/i, ["kg CO2e", "kg CO₂e"]],
      [/(?:^|_)kg$|washed_kg/i, ["kg"]],
      [/(?:^|_)l$|water_l|litres/i, ["l", "L", "litres"]],
      [/repair_count/i, ["repairs", "korjausta", "kpl"]],
      [/service_requests/i, ["requests", "palvelupyyntöä", "kpl"]],
      [/washed_pieces/i, ["pieces", "pesua", "kpl"]],
      [/(?:^|_)eur$/i, ["EUR", "€"]],
      [/(?:^|_)(count|events)$/i, ["events", "kpl", "count"]],
    ].find(([pattern]) => pattern.test(column))?.[1] ?? []
  );
}
function validateAdditiveColumn(profiles, definition) {
  const table = profiles.find(({ id }) => id === definition?.table);
  const column = table?.columns.find(({ id }) => id === definition.value)?.column ?? "";
  if (definition.operation !== "sum") return;
  if (!sumUnitsFor(column).includes(definition.unit))
    throw new PresentationError(
      "The column is not an additive quantity with a supported unit.",
      422,
    );
}
function ownerKey(customer) {
  const context = requestContext.getStore();
  return JSON.stringify([
    context?.user.tenant_id ?? "local",
    context?.user.id ?? "local",
    customer,
  ]);
}
function prune(cache) {
  for (const [key, entry] of cache) if (entry.expires <= Date.now()) cache.delete(key);
  while (cache.size > 32) cache.delete(cache.keys().next().value);
}

export function rememberAnalysisImport(customer, tables, report) {
  if (report.customerMatch !== "matched" || !report.providerSchemaSharing) return;
  prune(uploads);
  uploads.set(ownerKey(customer), {
    tables: structuredClone(tables),
    expires: Date.now() + lifetime,
  });
  prune(uploads);
}

export function analysisRuntime(workspace) {
  prune(uploads);
  prune(recipes);
  const scope = workspace.scope;
  const context = requestContext.getStore();
  if (context && !context.permissions.has(scope.customer))
    throw new PresentationError("No access to this customer.", 403);
  const select = (rows) => globalThis.WorkspaceModel.select(dataset, scope, rows);
  // Shared mode exposes only the current customer's prepared data. Raw rows may
  // be absent there, in which case only the supplied tools can answer the query.
  const tables = { activity: select(dataset.records), detail: select(dataset.detail ?? []) };
  const upload = uploads.get(ownerKey(scope.customer));
  if (upload) {
    for (const [name, rows] of Object.entries(upload.tables)) {
      tables["upload_" + name] = rows.filter((row) => {
        const period = row.month ?? row.kuukausi;
        const site = row.site ?? row.site_id;
        const country = row.country;
        return (
          (scope.site === "all" || site === scope.site) &&
          (scope.country === "all" || country === scope.country) &&
          (scope.from === dataset.year + "-01" && scope.to === dataset.year + "-12"
            ? !period || (period >= scope.from && period <= scope.to)
            : period >= scope.from && period <= scope.to)
        );
      });
    }
  }
  const populated = Object.fromEntries(Object.entries(tables).filter(([, rows]) => rows.length));
  const profiles = Object.keys(populated).length ? profileTables(populated) : [];
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([ownerKey(scope.customer), scope, tables]))
    .digest("hex");
  let entry = recipes.get(fingerprint);
  if (!entry) {
    entry = { definitions: new Map(), expires: Date.now() + lifetime };
    recipes.set(fingerprint, entry);
    prune(recipes);
  }
  return {
    schema: profiles.map(({ id, name, rows, duplicates, columns }) => ({
      id,
      name,
      rows: rows.length,
      duplicates,
      columns: columns.map(({ id, column, kind, missing }) => ({
        id,
        column,
        kind,
        missing,
        sumUnits: kind === "number" && !missing ? sumUnitsFor(column) : [],
      })),
    })),
    catalog: [...entry.definitions].map(([id, definition]) => {
      const table = profiles.find(({ id }) => id === definition.table);
      return {
        id,
        ...definition,
        source: {
          table: table.name,
          value: table.columns.find(({ id }) => id === definition.value).column,
        },
      };
    }),
    run(id) {
      const definition = entry.definitions.get(id);
      if (!definition)
        throw new PresentationError("The analysis tool has expired. Ask again.", 409);
      return testRecipe(profiles, definition);
    },
    create(definition) {
      let result;
      try {
        validateAdditiveColumn(profiles, definition);
        if (definition.period !== null) throw new Error("scope_is_already_selected");
        result = testRecipe(profiles, definition);
      } catch (error) {
        throw new PresentationError(
          "The proposed analysis tool failed validation: " + error.message,
          422,
        );
      }
      if (!entry.definitions.has(result.id) && entry.definitions.size >= 8)
        throw new PresentationError("This scope already has eight generated tools.", 429);
      entry.definitions.set(result.id, structuredClone(definition));
      return result;
    },
  };
}
