import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fileInstanceDtoSchema } from "~/adapters/project/gateway";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)));

function jsonFilesBelow(directoryPath: string): readonly string[] {
  if (!existsSync(directoryPath)) return [];
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(entry => {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) return jsonFilesBelow(entryPath);
    return entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

describe("materialized instance payload shape", () => {
  it("derives instance kind from its directory instead of persisting it", () => {
    const failures: string[] = [];
    let instanceCount = 0;

    for (const packageName of readdirSync(packageRoot)) {
      const generatedPackageRoot = resolve(
        packageRoot,
        packageName,
        "packages",
        packageName,
        "instances"
      );
      for (const expectedKind of ["authored", "overlay"] as const) {
        for (const filePath of jsonFilesBelow(resolve(generatedPackageRoot, expectedKind))) {
          instanceCount += 1;
          const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
          const result = fileInstanceDtoSchema.safeParse(raw);
          if (!result.success) {
            failures.push(`${filePath}: ${result.error.message}`);
            continue;
          }
          const actualKind = "sourceInstanceId" in result.data ? "overlay" : "authored";
          if (actualKind !== expectedKind) {
            failures.push(`${filePath}: ${actualKind} payload in ${expectedKind} directory`);
          }
        }
      }
    }

    expect(instanceCount).toBe(65);
    expect(failures).toEqual([]);
  });
});
