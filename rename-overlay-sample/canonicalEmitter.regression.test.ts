/**
 * Canonical emitter regression test for the rename-overlay-sample fixture.
 *
 * `buildCanonicalTypeRegistry` selects the canonical package for batch C#
 * generation, and each per-package emit is gated by
 * `shouldEmitForCanonicalGate`. This test verifies the end-to-end behaviour
 * for the Solitaire-shape rename chain (Character -> Charm):
 *
 *   - For the three unambiguous identity chains (CharacterCollection,
 *     CharacterExperience, CharacterRate) the consumer pkg
 *     `rename-overlay-sample` is the canonical emitter; it emits
 *     `CharmCollection.cs` / `CharmExperience.cs` / `CharmRate.cs` and the
 *     upstream foundation/gacha pkgs' `Character*.cs` artifacts are
 *     suppressed.
 *   - `ref` targets inside the canonical artifacts resolve through
 *     `resolveCanonicalTypeName` so that, e.g., a property
 *     pointing at the CharacterCollection identity is rewritten to
 *     `CharmCollectionId`.
 *   - The Character identity itself is ambiguous in this fixture (two
 *     overlay pkgs rename it). The registry emits a
 *     `codegen.canonicalAmbiguity` warning and disables canonical
 *     selection for that identity — both upstream and overlay pkgs fall
 *     back to legacy per-pkg gating + the existing cross-pkg overlay
 *     dedup. The ambiguity warning is the observable registry signal.
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

describe("rename-overlay-sample canonical emitter selection", () => {
  it("emits Charm{Collection,Experience,Rate} from the consumer and suppresses upstream Character* under canonical gating", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const catalog = loadProductionCatalog();
    const allResult = await loadPackages(packagesDir, catalog);
    const payload = unwrapLoaderResult(allResult);
    const pkgs = payload.packages!;

    const project = new Project(PackageCollection.fromTrusted(pkgs));
    const generationResult = generateAllPackagesCSharp({ project, catalog });
    if (Result.isFailure(generationResult)) {
      throw new Error(`generateAllPackagesCSharp failed: ${generationResult.error.message}`);
    }
    const result = generationResult.value;

    const consumer = result.succeeded.find(o => o.packageName === "rename-overlay-sample");
    const foundation = result.succeeded.find(o => o.packageName === "foundation-economy-character");
    const gacha = result.succeeded.find(o => o.packageName === "micro-shop-character-gacha");
    expect(consumer, "rename-overlay-sample must succeed").toBeDefined();
    expect(foundation, "foundation-economy-character must succeed").toBeDefined();
    expect(gacha, "micro-shop-character-gacha must succeed").toBeDefined();
    if (!consumer || !foundation || !gacha) return;

    const consumerFiles = new Set(consumer.artifacts.files.map(f => f.fileName));
    const foundationFiles = new Set(foundation.artifacts.files.map(f => f.fileName));
    const gachaFiles = new Set(gacha.artifacts.files.map(f => f.fileName));

    // ----- Unambiguous chains: canonical emission lands on the consumer pkg.
    for (const name of [
      "CharmCollection.cs",
      "CharmCollectionId.cs",
      "CharmExperience.cs",
      "CharmExperienceId.cs",
      "CharmRate.cs",
      "CharmRateId.cs",
    ]) {
      expect(consumerFiles.has(name), `consumer emits ${name}`).toBe(true);
    }

    // ----- Upstream pkgs do not emit their Character* artifacts for the
    // canonicalized identities (the canonical-emitter gate returns "skip").
    for (const name of [
      "CharacterCollection.cs",
      "CharacterCollectionId.cs",
      "CharacterExperience.cs",
      "CharacterExperienceId.cs",
    ]) {
      expect(foundationFiles.has(name), `foundation suppresses ${name}`).toBe(false);
    }
    for (const name of ["CharacterRate.cs", "CharacterRateId.cs"]) {
      expect(gachaFiles.has(name), `gacha suppresses ${name}`).toBe(false);
    }

    // ----- Canonical ref rewrite: id-typed properties inside the canonical
    // artifacts resolve through `resolveCanonicalTypeName`, so the upstream
    // local name (CharacterCollectionId etc.) must not leak into the
    // consumer-side output.
    const charmCollectionCs = consumer.artifacts.files.find(
      f => f.fileName === "CharmCollection.cs"
    );
    expect(charmCollectionCs, "CharmCollection.cs present").toBeDefined();
    if (charmCollectionCs) {
      expect(charmCollectionCs.content).not.toMatch(/CharacterCollectionId/);
    }

    // ----- Dependency-target fallback regression: CharmRate inherits a
    // `character` ref whose declarationContext is (micro-shop-character-gacha,
    // CharacterRate). The ref target `Character` is not local to gacha — it
    // lives in foundation. `resolveCanonicalTypeName` must consult the
    // alias-collapsed identityByPackageDependencyTypeName map and rewrite
    // `CharacterId` -> `CharmId` plus the `using` namespace.
    const charmRateCs = consumer.artifacts.files.find(f => f.fileName === "CharmRate.cs");
    expect(charmRateCs, "CharmRate.cs present").toBeDefined();
    if (charmRateCs) {
      expect(charmRateCs.content).not.toMatch(/CharacterId/);
      expect(charmRateCs.content).not.toMatch(/GS2Studio\.Generated\.Character\b/);
      expect(charmRateCs.content).toMatch(/CharmId/);
      expect(charmRateCs.content).toMatch(/GS2Studio\.Generated\.Charm\b/);
    }

    const charmRateOverlayEntryCs = consumer.artifacts.files.find(
      f => f.fileName === "CharmRateOverlayEntry.cs"
    );
    expect(charmRateOverlayEntryCs, "CharmRateOverlayEntry.cs present").toBeDefined();
    if (charmRateOverlayEntryCs) {
      expect(charmRateOverlayEntryCs.content).not.toMatch(/CharacterId/);
      expect(charmRateOverlayEntryCs.content).not.toMatch(/GS2Studio\.Generated\.Character\b/);
      expect(charmRateOverlayEntryCs.content).toMatch(/CharmId/);
      expect(charmRateOverlayEntryCs.content).toMatch(/GS2Studio\.Generated\.Charm\b/);
    }

    // ----- Tie-breaker: the `Character` identity has two overlay candidates
    // at the same lineage depth (rename-overlay-sample::Charm rename +
    // foundation-economy-character-dictionary::Character non-rename additions).
    // The rename overlay wins per the canonical-registry tie-breaker, so
    // there must be NO `codegen.canonicalAmbiguity` warning for Character and
    // the dictionary's Character.cs must be suppressed alongside the root.
    const allWarnings = result.succeeded.flatMap(o => o.artifacts.warnings);
    const ambiguityWarning = allWarnings.find(
      w => w.code === "codegen.canonicalAmbiguity" && w.message.includes("Character")
    );
    expect(
      ambiguityWarning,
      "rename tie-breaker should pick Charm and avoid an ambiguity warning"
    ).toBeUndefined();

    const dictionary = result.succeeded.find(
      o => o.packageName === "foundation-economy-character-dictionary"
    );
    if (dictionary) {
      const dictionaryFiles = new Set(dictionary.artifacts.files.map(f => f.fileName));
      expect(
        dictionaryFiles.has("Character.cs"),
        "dictionary's Character.cs must be suppressed by the canonical Charm emitter"
      ).toBe(false);
    }

    // Top-level Charm.cs (the rename winner for the Character identity) must
    // be emitted by the consumer package.
    expect(consumerFiles.has("Charm.cs"), "consumer emits Charm.cs from the rename overlay").toBe(
      true
    );

    // ----- UI components are authoring content owned by foundation, but the
    // rename overlay shifts the canonical type emission downstream. The
    // generator must still emit the UI files at the authoring pkg
    // (foundation) and rewrite the C# surface to the canonical Charm names
    // so the generated MonoBehaviours reference the actual Handler/Model.
    for (const name of [
      "Handlers/UI/CharmLevelLabel.cs",
      "Handlers/UI/CharmLevelCapLabel.cs",
      "Handlers/UI/CharmExperienceLabel.cs",
      "Handlers/UI/CharmLevelActiveToggle.cs",
      "Handlers/UI/CharmLevelInteractable.cs",
    ]) {
      expect(foundationFiles.has(name), `foundation emits ${name}`).toBe(true);
    }
    for (const name of [
      "Handlers/UI/CharacterLevelLabel.cs",
      "Handlers/UI/CharacterLevelCapLabel.cs",
      "Handlers/UI/CharacterExperienceLabel.cs",
      "Handlers/UI/CharacterLevelActiveToggle.cs",
      "Handlers/UI/CharacterLevelInteractable.cs",
    ]) {
      expect(foundationFiles.has(name), `foundation does not emit legacy ${name}`).toBe(false);
    }

    const charmLevelLabelCs = foundation.artifacts.files.find(
      f => f.fileName === "Handlers/UI/CharmLevelLabel.cs"
    );
    expect(charmLevelLabelCs, "CharmLevelLabel.cs present").toBeDefined();
    if (charmLevelLabelCs) {
      const content = charmLevelLabelCs.content;
      expect(content).toContain("namespace GS2Studio.Generated.Charm.UI");
      expect(content).toContain("using GS2Studio.Generated.Charm;");
      expect(content).toContain("CharmHandler");
      expect(content).toContain("OnUpdated(Charm model)");
      expect(content).toContain(
        '[AddComponentMenu("GS2 Studio/DomainType/Charm/Label/LevelLabel")]'
      );
      expect(content).not.toContain("using GS2Studio.Generated.Character;");
      expect(content).not.toContain("CharacterHandler");
      expect(content).not.toContain("OnUpdated(Character model)");
      expect(content).not.toContain("namespace GS2Studio.Generated.Character.UI");
    }

    const charmLevelActiveToggleCs = foundation.artifacts.files.find(
      f => f.fileName === "Handlers/UI/CharmLevelActiveToggle.cs"
    );
    expect(charmLevelActiveToggleCs, "CharmLevelActiveToggle.cs present").toBeDefined();
    if (charmLevelActiveToggleCs) {
      const content = charmLevelActiveToggleCs.content;
      expect(content).toContain("namespace GS2Studio.Generated.Charm.UI");
      expect(content).toContain("CharmHandler");
      expect(content).not.toContain("CharacterHandler");
    }
  });
});
