import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { detectDuplicateInstanceIds } from "~/application/project";
import { toSafeFileName } from "~/application/shared";
import { fileInstanceDtoSchema } from "~/adapters/project/gateway";
import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { Catalog } from "~/domain/catalog";
import { Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";

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
          const identity = actualKind === "overlay" ? result.data.sourceInstanceId : result.data.id;
          const expectedFileName = `${toSafeFileName(identity)}.json`;
          if (basename(filePath) !== expectedFileName) {
            failures.push(`${filePath}: expected canonical filename ${expectedFileName}`);
          }
        }
      }
    }

    expect(instanceCount).toBe(65);
    expect(failures).toEqual([]);
  });

  it.each(["rename-overlay-sample", "sample-child-restoration", "sample-social-game-basic"])(
    "has saveable instance identities in non-DSL sample %s",
    async sampleName => {
      const loadResult = await loadPackages(
        resolve(packageRoot, sampleName, "packages"),
        Catalog.empty()
      );
      const payload = unwrapLoaderResult(loadResult);
      expect(payload.errors).toEqual([]);
      expect(payload.packages).not.toBeNull();
      if (payload.packages === null) return;

      const project = new Project(
        Result.unwrapInvariant(PackageCollection.from(payload.packages), "loaded sample packages")
      );
      const diagnostics = detectDuplicateInstanceIds({
        project,
        validationMode: "strict",
      });

      expect(diagnostics).toEqual([]);
    }
  );
});
