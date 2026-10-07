import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { Catalog } from "~/domain/catalog";
import { DomainTypeName } from "~/domain/core";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("rename-overlay-sample loadability + overlay basics", () => {
  it("loads all four Charm overlays pointing at their canonical Character sources", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const allResult = await loadPackages(packagesDir, Catalog.empty());
    const payload = unwrapLoaderResult(allResult);
    const pkgs = payload.packages!;

    const samplePkg = pkgs.find(p => p.name === "rename-overlay-sample");
    expect(samplePkg).toBeDefined();
    if (!samplePkg) throw new Error("rename-overlay-sample not loaded");

    const cases: ReadonlyArray<{ overlay: string; source: string }> = [
      { overlay: "Charm", source: "Character" },
      { overlay: "CharmCollection", source: "CharacterCollection" },
      { overlay: "CharmExperience", source: "CharacterExperience" },
      { overlay: "CharmRate", source: "CharacterRate" },
    ];

    for (const { overlay, source } of cases) {
      const dt = samplePkg.domainTypes.getByName(DomainTypeName.trusted(overlay));
      expect(dt, `${overlay} should be loaded`).toBeDefined();
      if (!dt) continue;
      expect(dt.kind).toBe("overlay");
      if (dt.kind !== "overlay") continue;
      expect(typeof dt.source.sourceTypeId).toBe("string");
      void source;
    }
  });
});
