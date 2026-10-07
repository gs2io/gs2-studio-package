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

    const charmCollectionCs = consumer.artifacts.files.find(
      f => f.fileName === "CharmCollection.cs"
    );
    expect(charmCollectionCs, "CharmCollection.cs present").toBeDefined();
    if (charmCollectionCs) {
      expect(charmCollectionCs.content).not.toMatch(/CharacterCollectionId/);
    }

    // This reference is declared in a dependency, so canonical resolution must also traverse its dependency alias.
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

    expect(consumerFiles.has("Charm.cs"), "consumer emits Charm.cs from the rename overlay").toBe(
      true
    );

    // UI stays with its authoring package even when canonical model emission moves downstream.
    for (const name of [
      "Handlers/UI/CharmLevelLabel.cs",
      "Handlers/UI/CharmExperienceGauge.cs",
      "Handlers/UI/CharmLevelActiveToggle.cs",
      "Handlers/UI/CharmLevelInteractable.cs",
      "Handlers/UI/CharmIdValue.cs",
      "Handlers/UI/CharmPropertyIdValue.cs",
    ]) {
      expect(foundationFiles.has(name), `foundation emits ${name}`).toBe(true);
    }
    for (const name of [
      "Handlers/UI/CharacterLevelLabel.cs",
      "Handlers/UI/CharacterExperienceGauge.cs",
      "Handlers/UI/CharacterLevelActiveToggle.cs",
      "Handlers/UI/CharacterLevelInteractable.cs",
      "Handlers/UI/CharacterIdValue.cs",
      "Handlers/UI/CharacterPropertyIdValue.cs",
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
        '[AddComponentMenu("GS2 Studio/DomainType/Charm/TemplateLabel/LevelLabel")]'
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
