import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { readImportFile } from "../backend/import-file.mjs";
import { analyzeImport } from "../backend/import-analysis.mjs";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const cell = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const numeric = (ref, value, style = 0) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
const row = (...cells) => `<row>${cells.join("")}</row>`;
const sheet = (...rows) =>
  `<worksheet xmlns="${ns}"><sheetData>${rows.join("")}</sheetData></worksheet>`;

async function workbook({ sheets, tables = {}, styles = "", date1904 = false }) {
  const zip = new JSZip();
  const names = Object.keys(sheets);
  zip.file(
    "xl/workbook.xml",
    `<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="${Number(date1904)}"/><sheets>${names.map((name, index) => `<sheet name="${name}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<Relationships>${names.map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`,
  );
  for (const [index, [name, content]] of Object.entries(sheets).entries()) {
    const member = `sheet${index + 1}.xml`;
    zip.file("xl/worksheets/" + member, content);
    if (tables[name]) {
      zip.file(
        `xl/worksheets/_rels/${member}.rels`,
        `<Relationships><Relationship Id="Table1" Target="../tables/table${index + 1}.xml"/></Relationships>`,
      );
      zip.file(`xl/tables/table${index + 1}.xml`, tables[name]);
    }
  }
  if (styles)
    zip.file(
      "xl/styles.xml",
      `<styleSheet xmlns="${ns}"><cellXfs>${styles}</cellXfs></styleSheet>`,
    );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("Excel report titles, sparse rows, dates, cached formulas, percentages and totals are interpreted", async () => {
  const data = await readImportFile(
    await workbook({
      styles: '<xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="10"/>',
      sheets: {
        Report: sheet(
          row(cell("A1", "Workwear activity report 2025")),
          row(cell("A4", "Date"), cell("C4", "Washed kg"), cell("D4", "Coverage")),
          row(numeric("A5", 45658, 1), '<c r="C5"><f>10+5</f><v>15</v></c>', numeric("D5", 0.8, 2)),
          row(numeric("A6", 45689, 1), numeric("C6", 20), numeric("D6", 0.9, 2)),
          row(numeric("A7", 45717, 1), numeric("C7", 25), numeric("D7", 1, 2)),
          row(cell("A8", "Total"), numeric("C8", 60)),
        ),
      },
    }),
    "xlsx",
  );
  assert.deepEqual(data.Report, [
    { Date: "2025-01-01", "Washed kg": 15, Coverage: "80%" },
    { Date: "2025-02-01", "Washed kg": 20, Coverage: "90%" },
    { Date: "2025-03-01", "Washed kg": 25, Coverage: "100%" },
  ]);
  const report = await analyzeImport(data, { customer: "demo" });
  assert.equal(report.localTools.find((tool) => tool.definition.name === "Washed kg").result, 60);
  const coverage = report.localTools.find((tool) => tool.definition.name === "Coverage");
  assert.equal(coverage.result, 90);
  assert.equal(coverage.definition.unit, "%");
  assert.equal(coverage.definition.operation, "mean");
});

test("named Excel table ignores cells beside the table and 1904 dates use the right epoch", async () => {
  const data = await readImportFile(
    await workbook({
      date1904: true,
      styles: '<xf numFmtId="0"/><xf numFmtId="14"/>',
      sheets: {
        Summary: sheet(
          row(cell("A1", "Notes"), cell("F1", "A table at the right")),
          row(cell("D4", "Date"), cell("E4", "Repairs")),
          row(numeric("D5", 44196, 1), numeric("E5", 2), cell("G5", "Outside table")),
          row(numeric("D6", 44197, 1), numeric("E6", 3)),
          row(numeric("D7", 44198, 1), numeric("E7", 4)),
          row(cell("D8", "Total"), numeric("E8", 9)),
        ),
        Empty: sheet(),
      },
      tables: {
        Summary: `<table xmlns="${ns}" name="RepairsTable" ref="D4:E8" totalsRowCount="1"><tableColumns><tableColumn name="Date"/><tableColumn name="Repairs"/></tableColumns></table>`,
      },
    }),
    "xlsx",
  );
  assert.deepEqual(Object.keys(data), ["Summary / RepairsTable"]);
  const rows = data["Summary / RepairsTable"];
  assert.equal(rows.length, 3);
  assert.equal(rows[0].Date, "2025-01-01");
  assert.equal(rows[2].Repairs, 4);
});

test("bad Excel archives, duplicate headers and uncached formulas cannot make a fake total", async () => {
  const bad = await workbook({
    sheets: {
      Report: sheet(
        row(cell("A1", "Repairs"), cell("B1", "Repairs")),
        row(numeric("A2", 2), numeric("B2", 3)),
      ),
    },
  });
  await assert.rejects(readImportFile(bad, "xlsx"), /headers must be unique/);
  await assert.rejects(readImportFile(Buffer.from("not a zip"), "xlsx"), /Could not read/);
  const hostile = await workbook({
    sheets: { Report: '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///secret">]><r/>' },
  });
  await assert.rejects(readImportFile(hostile, "xlsx"), /XML declarations/);
  const data = await readImportFile(
    await workbook({
      sheets: {
        Report: sheet(
          row(cell("A1", "Date"), cell("B1", "Repairs")),
          row(cell("A2", "2025-01"), numeric("B2", 3)),
          row(cell("A3", "2025-02"), '<c r="B3"><f>10+1</f></c>'),
          row(cell("A4", "2025-03"), numeric("B4", 5)),
        ),
      },
    }),
    "xlsx",
  );
  const report = await analyzeImport(data, { customer: "demo" });
  assert.equal(report.quality[0].columns[1].kind, "mixed");
  assert.deepEqual(report.localTools, []);
});

test("separated Excel tables can have different schemas while gaps in one table keep its rows", async () => {
  const data = await readImportFile(
    await workbook({
      sheets: {
        Operations: sheet(
          row(cell("A1", "Site"), cell("B1", "Washed kg")),
          row(cell("A2", "A"), numeric("B2", 20)),
          row(cell("A3", "B"), numeric("B3", 35)),
          row(cell("A4", "A"), numeric("B4", 50)),
          row(cell("A8", "Product"), cell("B8", "Repairs")),
          row(cell("A9", "Coat"), numeric("B9", 2)),
          row(cell("A10", "Trousers"), numeric("B10", 3)),
          row(cell("A11", "Coat"), numeric("B11", 4)),
        ),
        Expenses: sheet(
          row(cell("A1", "Region"), cell("B1", "Cost EUR")),
          row(cell("A2", "North"), numeric("B2", 50)),
          row(cell("A3", "South"), numeric("B3", 51)),
          row(cell("A8", "North"), numeric("B8", 49)),
        ),
      },
    }),
    "xlsx",
  );
  assert.deepEqual(Object.keys(data), ["Operations / Block 1", "Operations / Block 2", "Expenses"]);
  const report = await analyzeImport(data, { customer: "demo" });
  assert.deepEqual(
    report.localTools.map(({ result }) => result),
    [105, 9, 150],
  );
});

test("Finnish CSV totals, dates, numbers and site breakdowns reconcile", async () => {
  const file = await readFile(new URL("./fixtures/imports/site-activity-fi.csv", import.meta.url));
  const data = await readImportFile(file, "csv");
  assert.equal(data.CSV.length, 6);
  const report = await analyzeImport(data, { customer: "demo" });
  const weight = report.localTools.find((tool) => tool.definition.name === "Pesty kg");
  assert.equal(weight.result, 3501);
  assert.equal(weight.comparison.before, 3000.5);
  assert.deepEqual(
    weight.breakdowns[1].rows.map(({ label, value }) => [label, value]),
    [
      ["Helsinki", 2451],
      ["Tampere", 1050],
    ],
  );
  assert.notEqual(
    report.localTools.find((tool) => tool.definition.name === "Varastosaldo")?.definition.operation,
    "sum",
  );
  await assert.rejects(
    readImportFile(Buffer.from("Month,Amount\n2025-01,12,unexpected\n"), "csv"),
    /CSV row|Could not read/,
  );
});

test("the repository's multi-sheet workbook retains its known source row counts", async () => {
  const file = await readFile(
    new URL(
      "../data/source/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx",
      import.meta.url,
    ),
  );
  const tables = await readImportFile(file, "xlsx");
  assert.equal(tables.Customers.length, 3);
  assert.equal(tables.Service_Activity.length, 1248);
  assert.equal(tables.Service_Cycles.length, 16415);
});
