import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fileDomainTypeDtoSchema } from "~/adapters/project/gateway";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)));

function jsonFilesBelow(directoryPath: string): readonly string[] {
  if (!existsSync(directoryPath)) return [];
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(entry => {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) return jsonFilesBelow(entryPath);
    return entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

describe("materialized domain type payload shape", () => {
  it("derives an overlay source's dependency kind from its enclosing domain type", () => {
    const failures: string[] = [];
    let domainTypeCount = 0;
    let overlayCount = 0;

    for (const packageName of readdirSync(packageRoot)) {
      const domainTypeRoot = resolve(
        packageRoot,
        packageName,
        "packages",
        packageName,
        "domain-types"
      );
      for (const filePath of jsonFilesBelow(domainTypeRoot)) {
        domainTypeCount += 1;
        const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
        const result = fileDomainTypeDtoSchema.safeParse(raw);
        if (!result.success) {
          failures.push(`${filePath}: ${result.error.message}`);
          continue;
        }
        if (result.data.kind === "overlay") {
          overlayCount += 1;
          if ("kind" in result.data.source) {
            failures.push(`${filePath}: overlay source persists a redundant kind`);
          }
        }
      }
    }

    expect(domainTypeCount).toBe(89);
    expect(overlayCount).toBe(13);
    expect(failures).toEqual([]);
  });
});
