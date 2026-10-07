/** Stacked ItemSets can share itemName, so this fixture separates domain identity from backing-row identity and reads propertyId per item. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import type {
  RawActionsJson,
  RawBindJson,
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
        bind: readJsonFile(resolve(catalogsDir, serviceName, "bind.json")) as
          | RawBindJson
          | undefined,
      };
    },
  });
  if (Result.isFailure(r)) throw new Error(r.error.diagnostics.map(d => d.message).join("; "));
  return r.value.catalog;
}

async function generateCharacterCollection(): Promise<{
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
  const file = pkg!.artifacts.files.find(f => f.fileName === "CharacterBinderCollection.cs");
  expect(file, "CharacterBinderCollection.cs must be emitted").toBeDefined();
  return {
    content: file!.content,
    warnings: (pkg!.artifacts.warnings ?? []).map(w =>
      typeof w === "string" ? w : (w as { readonly message: string }).message
    ),
  };
}

describe("foundation-economy-character fan-out identity (generated C#)", () => {
  it("derives the axis ids from the authored reserved-id binding and reconciles on the row key", async () => {
    const { content, warnings } = await generateCharacterCollection();

    expect(content).toContain(
      "private CharacterId ExtractInventoryCharacterUserIdentity(Gs2.Unity.Gs2Inventory.Model.EzItemSet item)"
    );
    expect(content).toContain(
      "(string.IsNullOrEmpty(item.ItemName) ? default(CharacterId) : new CharacterId(item.ItemName))"
    );

    expect(content).toContain(
      "private string? ExtractInventoryCharacterUserRowKey(Gs2.Unity.Gs2Inventory.Model.EzItemSet item)"
    );
    expect(content).toContain(
      "if (string.IsNullOrEmpty(item.ItemName) || string.IsNullOrEmpty(item.Name)) return null;"
    );
    expect(content).toContain('return $"{item.ItemName}.{item.Name}";');

    expect(content).toContain(
      "private CharacterId ExtractInventoryCharacterMasterIdentity(Gs2.Unity.Gs2Inventory.Model.EzItemModel item)"
    );
    expect(content).toContain(
      "(string.IsNullOrEmpty(item.Name) ? default(CharacterId) : new CharacterId(item.Name))"
    );
    expect(content).toContain("MountFromInventoryCharacterMasterDataAsync");

    expect(content).toContain("_bindersByRowKey");

    expect(content).toContain("item.ItemSetId)");
    expect(content).toContain("string.Empty)");

    expect(content).not.toContain("string propertyId");

    expect(content).not.toContain("MountFromExperience");
    expect(warnings.some(w => /for Character (not generated|omitted)/.test(w))).toBe(false);
  });
});
