/**
 * Regression test for the `Unsupported type conversion: long → List<long>`
 * bug (reported against Solitaire's `CharmExperience.threshold`, which
 * overlays this package's `CharacterExperience.threshold`).
 *
 * `CharacterExperience.threshold` (`list<int64>`) is bound to
 * `experience::Threshold.values` (catalog type `[]int64`) through a nested
 * `rankThreshold` value-model promotion
 * (`master-data/experience-namespace--.../_array_rank-threshold/...`). The
 * Ez SDK already exposes `EzThreshold.Values` as `List<long>`, so this must
 * resolve to a direct (null-guarded) copy — not a skipped/unsupported
 * assignment.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import type {
  RawActionsJson,
  RawMasterData,
  RawModelsJson,
  RawServicesJson,
  RawTransactionsJson,
} from "~/application/catalog";
import { assembleCatalog } from "~/application/catalog";
import { generateAllPackagesCSharp } from "~/application/codegen";
import { Catalog } from "~/domain/catalog";
import { Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const catalogsDir = resolve(repoRoot, "src/catalogs");

function readJsonFile(p: string): unknown {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

function loadProductionCatalog(): Catalog {
  const services = JSON.parse(
    readFileSync(resolve(catalogsDir, "services.json"), "utf-8")
  ) as RawServicesJson;
  const r = assembleCatalog({
    services,
    resolveServiceData(serviceName) {
      return {
        models: (readJsonFile(resolve(catalogsDir, serviceName, "models.json")) ??
          {}) as RawModelsJson,
        transactions: (readJsonFile(resolve(catalogsDir, serviceName, "transactions.json")) ??
          {}) as RawTransactionsJson,
        actions: JSON.parse(
          readFileSync(resolve(catalogsDir, serviceName, "actions.json"), "utf-8")
        ) as RawActionsJson,
        masterData: (readJsonFile(resolve(catalogsDir, serviceName, "masterData.json")) ?? {
          hasMasterData: false,
        }) as RawMasterData,
      };
    },
  });
  if (Result.isFailure(r)) throw new Error(r.error.diagnostics.map(d => d.message).join("; "));
  return r.value.catalog;
}

async function generateCharacterExperienceBinder(): Promise<{
  readonly content: string;
  readonly warnings: readonly string[];
}> {
  const packagesDir = resolve(currentDir, "packages");
  const catalog = loadProductionCatalog();
  const allResult = await loadPackages(packagesDir, catalog);
  const payload = unwrapLoaderResult(allResult);
  const project = new Project(PackageCollection.fromTrusted(payload.packages!));
  const generationResult = generateAllPackagesCSharp({ project, catalog });
  if (Result.isFailure(generationResult)) {
    throw new Error(`generateAllPackagesCSharp failed: ${generationResult.error.message}`);
  }
  const pkg = generationResult.value.succeeded.find(
    o => o.packageName === "foundation-economy-character"
  );
  expect(pkg, "foundation-economy-character must succeed").toBeDefined();
  const file = pkg!.artifacts.files.find(f => f.fileName === "CharacterExperienceBinder.cs");
  expect(file, "CharacterExperienceBinder.cs must be emitted").toBeDefined();
  return {
    content: file!.content,
    warnings: (pkg!.artifacts.warnings ?? []).map(w =>
      typeof w === "string" ? w : (w as { readonly message: string }).message
    ),
  };
}

describe("foundation-economy-character CharacterExperience.threshold (generated C#)", () => {
  it("copies the catalog array onto the list<int64> property with a null guard, not a skip comment", async () => {
    const { content, warnings } = await generateCharacterExperienceBinder();

    expect(content).toContain(
      "model.Threshold = source.RankThreshold == null || source.RankThreshold.Values == null ? new List<long>() : source.RankThreshold.Values;"
    );
    expect(content).not.toContain("Unsupported type conversion");
    expect(warnings.some(w => w.includes("threshold"))).toBe(false);
  });
});
