import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
const referenceUrl = new URL(
  "../docs/references/Lindstrom_SinceAI_Managerial_Dashboard_REFERENCE.pptx",
  import.meta.url,
);
export const templateStandard = Object.freeze({
  version: "lindstrom-reference-2026-11-06-v1",
  sha256: "5d1f801c45f05db83b583bc5a14b940805b8ce9631674de9031425ffee7aa18f",
  width: 10,
  height: 5.625,
  headingFont: "Libre Franklin Black",
  bodyFont: "Libre Franklin",
  blue: "003F72",
  teal: "0094B3",
  green: "7AB800",
  magenta: "CA005D",
  red: "E52330",
});
const attrs = (text) =>
  Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const relationships = (xml) =>
  [...xml.matchAll(/<Relationship\b[^>]*\/>/g)].map((m) => ({ xml: m[0], ...attrs(m[0]) }));
const relsPath = (part) => `${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`;
const mapped = (part) => `${path.posix.dirname(part)}/lindstrom-${path.posix.basename(part)}`;
let referencePromise;
async function reference() {
  referencePromise ||= (async () => {
    const bytes = await readFile(referenceUrl);
    if (createHash("sha256").update(bytes).digest("hex") !== templateStandard.sha256)
      throw new Error(
        "The approved Lindstrom reference changed; review the standard before exporting.",
      );
    return JSZip.loadAsync(bytes);
  })();
  return referencePromise;
}
export async function applyLindstromTemplate(bytes) {
  const source = await reference(),
    zip = await JSZip.loadAsync(bytes);
  const master = "ppt/slideMasters/slideMaster1.xml",
    layout = "ppt/slideLayouts/slideLayout19.xml";
  const copied = new Set(),
    queue = [master, layout];
  let masterLayoutId;
  const masterRels = relationships(await source.file(relsPath(master)).async("string"));
  masterLayoutId = masterRels.find(
    (r) =>
      r.Type.endsWith("/slideLayout") &&
      path.posix.normalize(`ppt/slideMasters/${r.Target}`) === layout,
  )?.Id;
  if (!masterLayoutId) throw new Error("Approved blank layout is missing from reference master.");
  // Remove generated masters/layouts, including the library's dangling content-type overrides.
  for (const name of Object.keys(zip.files))
    if (name.startsWith("ppt/slideMasters/") || name.startsWith("ppt/slideLayouts/"))
      zip.remove(name);
  while (queue.length) {
    const part = queue.shift();
    if (copied.has(part)) continue;
    copied.add(part);
    if (!source.file(part)) throw new Error("Reference relationship target is missing.");
    let data = await source.file(part).async("nodebuffer");
    if (part === master)
      data = Buffer.from(
        data
          .toString()
          .replace(/<p:sldLayoutId\b[^>]*\/>/g, (tag) =>
            attrs(tag)["r:id"] === masterLayoutId ? tag : "",
          ),
      );
    zip.file(mapped(part), data);
    const relationshipPart = source.file(relsPath(part));
    if (!relationshipPart) continue;
    let xml = await relationshipPart.async("string");
    for (const rel of relationships(xml)) {
      if (part === master && rel.Type.endsWith("/slideLayout") && rel.Id !== masterLayoutId) {
        xml = xml.replace(rel.xml, "");
        continue;
      }
      if (rel.TargetMode === "External") continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(part), rel.Target));
      queue.push(target);
      const relative = path.posix.relative(path.posix.dirname(mapped(part)), mapped(target));
      xml = xml.replace(rel.xml, rel.xml.replace(/Target="[^"]*"/, `Target="${relative}"`));
    }
    zip.file(relsPath(mapped(part)), xml);
  }
  for (const name of Object.keys(zip.files)) {
    if (name === "ppt/_rels/presentation.xml.rels") {
      const xml = await zip.file(name).async("string");
      zip.file(
        name,
        xml.replace(/<Relationship\b[^>]*\/>/g, (tag) =>
          attrs(tag).Type?.endsWith("/slideMaster")
            ? tag.replace(
                /Target="[^"]*"/,
                `Target="slideMasters/${path.posix.basename(mapped(master))}"`,
              )
            : tag,
        ),
      );
    } else if (/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)) {
      const xml = await zip.file(name).async("string");
      zip.file(
        name,
        xml.replace(/<Relationship\b[^>]*\/>/g, (tag) =>
          attrs(tag).Type?.endsWith("/slideLayout")
            ? tag.replace(
                /Target="[^"]*"/,
                `Target="../slideLayouts/${path.posix.basename(mapped(layout))}"`,
              )
            : tag,
        ),
      );
    }
  }
  let types = await zip.file("[Content_Types].xml").async("string");
  types = types.replace(/<Override\b[^>]*\/>/g, (tag) =>
    zip.file(attrs(tag).PartName?.slice(1)) ? tag : "",
  );
  const originalTypes = await source.file("[Content_Types].xml").async("string");
  const additions = [];
  for (const match of originalTypes.matchAll(/<Override\b[^>]*\/>/g)) {
    const attributes = attrs(match[0]),
      part = attributes.PartName.slice(1);
    if (copied.has(part)) additions.push(match[0].replace(attributes.PartName, `/${mapped(part)}`));
  }
  const extensions = new Set(
    [...types.matchAll(/<Default\b[^>]*\/>/g)].map((m) => attrs(m[0]).Extension),
  );
  for (const match of originalTypes.matchAll(/<Default\b[^>]*\/>/g))
    if (!extensions.has(attrs(match[0]).Extension)) {
      additions.push(match[0]);
      extensions.add(attrs(match[0]).Extension);
    }
  zip.file("[Content_Types].xml", types.replace("</Types>", `${additions.join("")}</Types>`));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
