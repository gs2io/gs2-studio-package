/**
 * Fan-out identity regression test for the foundation-economy-character
 * fixture (the Solitaire Character/Charm shape).
 *
 * `Character:id` is authored-bound to `ItemModel:name`; per-user Character
 * rows come from the inventory `ItemSet` axis where stacked ItemSets share an
 * `itemName`. The generated Collection must FAN those rows OUT — same
 * CharacterId, distinct rows — which requires the identity split this test
 * pins end-to-end on the emitted C#:
 *
 *  - domain id: derived from the authored reserved-id binding per axis
 *    (`item.ItemName` on the ItemSet axis via the linked-master correlation,
 *    `item.Name` on the revived ItemModel master axis) — non-unique allowed;
 *  - row key: the backing per-item own-key tuple (`{item.ItemName}.{item.Name}`),
 *    internal to the reconcile dictionary, never on the model or public API;
 *  - PropertyId: per-row server truth — `item.ItemSetId` on the user axis
 *    (the authored `itemSetId → propertyId` binding read back off the loop
 *    item), `string.Empty` seed on the master axis where it cannot resolve;
 *  - CharacterExperience/Status data joins per item (each row binder mounts
 *    its own StatusLoader) — Status never becomes a Character list axis.
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

    // User axis: id = itemName (ItemSet.itemName = ItemModel.name = Character:id).
    expect(content).toContain(
      "private CharacterId ExtractInventoryCharacterUserIdentity(EzItemSet item)"
    );
    expect(content).toContain(
      "(string.IsNullOrEmpty(item.ItemName) ? default(CharacterId) : new CharacterId(item.ItemName))"
    );

    // Row key: per-item own-key tuple — distinct per stacked ItemSet even when
    // the id repeats. String parts guard with IsNullOrEmpty and skip via null.
    expect(content).toContain(
      "private string? ExtractInventoryCharacterUserRowKey(EzItemSet item)"
    );
    expect(content).toContain(
      'if (string.IsNullOrEmpty(item.ItemName) || string.IsNullOrEmpty(item.Name)) return null;'
    );
    expect(content).toContain('return $"{item.ItemName}.{item.Name}";');

    // Master axis revived: same authored binding, per-item `item.Name`.
    expect(content).toContain(
      "private CharacterId ExtractInventoryCharacterMasterIdentity(EzItemModel item)"
    );
    expect(content).toContain(
      "(string.IsNullOrEmpty(item.Name) ? default(CharacterId) : new CharacterId(item.Name))"
    );
    expect(content).toContain("MountFromInventoryCharacterMasterDataAsync");

    // Reconcile dictionary keys rows by the row key, not the (non-unique) id.
    expect(content).toContain("_bindersByRowKey");

    // PropertyId: per-row `item.ItemSetId` on the user axis; string.Empty seed
    // on the master axis (no derivation possible from master data alone).
    expect(content).toContain("item.ItemSetId)");
    expect(content).toContain("string.Empty)");

    // No collection-wide propertyId ctor arg: the value is per-item server
    // truth (per-row on the user axis, join-resolved per binder).
    expect(content).not.toContain("string propertyId");

    // Status never becomes a Character list axis (its data joins per item),
    // and the Character axes are complete — no omission warning for Character
    // itself. (CharacterCollection / CharacterExperience omissions are
    // separate types and expected.)
    expect(content).not.toContain("MountFromExperience");
    expect(warnings.some(w => /for Character (not generated|omitted)/.test(w))).toBe(false);
  });
});
