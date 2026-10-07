import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { collectOverriddenDomainTypes, isOverridden } from "~/application/package";
import { Catalog } from "~/domain/catalog";
import { DomainTypeName, PackageId, Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";

const currentDir = dirname(fileURLToPath(import.meta.url));

const RENAME_CASES = [
  { overlay: "Charm", source: "Character", sourcePkgName: "foundation-economy-character" },
  {
    overlay: "CharmCollection",
    source: "CharacterCollection",
    sourcePkgName: "foundation-economy-character",
  },
  {
    overlay: "CharmExperience",
    source: "CharacterExperience",
    sourcePkgName: "foundation-economy-character",
  },
  { overlay: "CharmRate", source: "CharacterRate", sourcePkgName: "micro-shop-character-gacha" },
] as const;

describe("rename overlay → source type override registration", () => {
  it("registers each source Character* identity in overriddenKeys and isOverridden(...) returns true", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const allResult = await loadPackages(packagesDir, Catalog.empty());
    const payload = unwrapLoaderResult(allResult);
    const pkgs = payload.packages!;
    const project = new Project(
      Result.unwrapInvariant(PackageCollection.from(pkgs), "loaded rename-overlay packages")
    );

    const editablePackageIds = new Set<PackageId>();
    for (const pkg of pkgs) {
      if (pkg.isEditable()) editablePackageIds.add(pkg.id);
    }

    const overriddenKeys = collectOverriddenDomainTypes({
      project,
      editablePackageIds,
    });

    for (const { source, sourcePkgName } of RENAME_CASES) {
      const sourcePkg = pkgs.find(p => p.name === sourcePkgName);
      expect(sourcePkg, `${sourcePkgName} should be loaded`).toBeDefined();
      if (!sourcePkg) continue;

      const sourceTypeId = sourcePkg.domainTypes.idForName(DomainTypeName.trusted(source));
      expect(sourceTypeId, `${source} should be declared in ${sourcePkgName}`).toBeDefined();
      if (!sourceTypeId) continue;
      const target = { packageId: sourcePkg.id, domainTypeId: sourceTypeId };
      const overridden = isOverridden({
        overriddenKeys,
        target,
      });

      if (!overridden) {
        console.warn(
          `[diagnostic] ${source} from ${sourcePkgName} (id=${sourcePkg.id as string}) was NOT in overriddenKeys.\n` +
            `overriddenKeys snapshot: ${JSON.stringify([...overriddenKeys])}`
        );
      }
      expect(overridden, `${source} from ${sourcePkgName} must be in overriddenKeys`).toBe(true);
    }
  });
});
