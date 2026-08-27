/**
 * Reproduces and diagnoses the master-data list residual Character bug:
 * with a viewer package that overlay-renames Character → Charm, the original
 * Character type from the source dependency must be filtered out of the
 * master-data left-pane list via `collectOverriddenDomainTypes` /
 * `isOverridden`.
 *
 * This test exercises the override-collection path on the rename-overlay-sample
 * fixture, asserting:
 *
 *   1. `collectOverriddenDomainTypes` registers `(foundationPkgId, "Character")`
 *      (and the other three Character* identities) in `overriddenKeys`.
 *   2. `isOverridden` returns true for each Character* type using the same
 *      `pkg.id` value that `master-data._index.tsx` consumes.
 *
 * If either assertion fails, the failure mode pinpoints whether the bug is
 * (a) override-key construction (e.g. alias resolution / packageId mismatch),
 * or (b) lookup-key mismatch (e.g. PackageId branded type vs string).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { collectOverriddenDomainTypes, isOverridden } from "~/application/package";
import { Catalog } from "~/domain/catalog";
import { DomainTypeName, type PackageDomainTypeRef, PackageId } from "~/domain/core";

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

    const editablePackageIds = new Set<PackageId>();
    for (const pkg of pkgs) {
      if (pkg.isEditable()) editablePackageIds.add(pkg.id);
    }

    const overriddenKeys = collectOverriddenDomainTypes({
      packages: pkgs,
      editablePackageIds,
    });

    for (const { source, sourcePkgName } of RENAME_CASES) {
      const sourcePkg = pkgs.find(p => p.name === sourcePkgName);
      expect(sourcePkg, `${sourcePkgName} should be loaded`).toBeDefined();
      if (!sourcePkg) continue;

      const target: PackageDomainTypeRef = {
        packageId: sourcePkg.id,
        typeName: DomainTypeName.trusted(source),
      };
      const overridden = isOverridden({
        overriddenKeys,
        target,
      });

      // Diagnostic: dump the actual overriddenKeys when an assertion fails.
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
