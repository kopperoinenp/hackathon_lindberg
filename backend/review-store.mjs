import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { dataset } from "./dataset.mjs";
import { normalizeWorkspace } from "./review-chat.mjs";
import { PresentationError } from "./presentation-model.mjs";

export function createReviewStore(directory) {
  let queue = Promise.resolve();
  function file(customer) {
    if (!dataset)
      throw new PresentationError("A valid dataset is required to load customer reviews.", 503);
    if (!dataset.customers.some((row) => row.customer_id === customer))
      throw new PresentationError("Unknown customer.", 404);
    return path.join(directory, `${customer}.json`);
  }
  async function read(customer) {
    const target = file(customer);
    try {
      const record = JSON.parse(await readFile(target, "utf8"));
      if (
        record.customer !== customer ||
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        record.workspace?.scope?.customer !== customer
      )
        throw new Error("Invalid record");
      return { ...record, workspace: normalizeWorkspace(record.workspace, { allowEmpty: true }) };
    } catch (error) {
      if (error.code === "ENOENT")
        return { customer, revision: 0, workspace: null, updatedAt: null };
      if (error instanceof PresentationError) throw error;
      throw new PresentationError("Saved review could not be read. It was not overwritten.", 500);
    }
  }
  function save(customer, input) {
    const operation = queue.then(async () => {
      file(customer);
      if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0)
        throw new PresentationError("Invalid review revision.");
      const workspace = normalizeWorkspace(input.workspace, { allowEmpty: true });
      if (workspace.scope.customer !== customer) throw new PresentationError("Customer mismatch.");
      const previous = await read(customer);
      if (previous.revision !== input.revision)
        throw new PresentationError(
          "This review was changed in another window. Reload before saving.",
          409,
        );
      const record = {
        customer,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString(),
        workspace,
      };
      await mkdir(directory, { recursive: true });
      const temporary = path.join(directory, `${customer}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", flag: "wx" });
        await rename(temporary, file(customer));
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return record;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, save };
}
