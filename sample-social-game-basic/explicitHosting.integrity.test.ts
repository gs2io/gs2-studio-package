import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { Catalog } from "~/domain/catalog";
import { projectWithPackages } from "~/testing/projectBuilders";
import { DomainType } from "~/domain/domainType";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(currentDir, "packages");
const migratedPackageNames = ["sample-social-game-basic", "micro-shop-currency"] as const;

describe("canonical instance type fixture integrity", () => {
  it("preserves the real declaration-free dependency-row topology", async () => {
    const loadResult = await loadPackages(packagesDir, Catalog.empty());
    const packages = unwrapLoaderResult(loadResult).packages!;
    const pkg = packages.find(candidate => candidate.name === "sample-social-game-basic")!;
    const representedCanonicalTypeIds = new Set(
      [...pkg.domainTypes].map(
        domainType => DomainType.getCanonicalRowTypeId(domainType) ?? domainType.id
      )
    );
    const authoredTypeIds = new Set(
      pkg.instances.getAuthoredValueInstances().map(instance => instance.typeId)
    );
    const undeclaredTypeIds = [...authoredTypeIds].filter(
      typeId => !representedCanonicalTypeIds.has(typeId)
    );

    expect(pkg.instances.getAuthoredValueInstances()).toHaveLength(33);
    expect(pkg.instances.getAllInstances()).toHaveLength(39);
    expect(undeclaredTypeIds).toHaveLength(9);
  });

  it("keys every persisted row by a unique canonical type in the dependency closure", async () => {
    const loadResult = await loadPackages(packagesDir, Catalog.empty());
    const packages = unwrapLoaderResult(loadResult).packages!;
    const project = projectWithPackages(packages);

    for (const packageName of migratedPackageNames) {
      const pkg = packages.find(candidate => candidate.name === packageName)!;

      for (const instance of pkg.instances.getAllInstances()) {
        const definers = project.dependencyGraph.findDefinersInClosureOf(pkg, instance.typeId);
        expect(definers, `${packageName}/${instance.typeId}`).toHaveLength(1);
        expect(
          definers[0]?.domainTypes.getById(instance.typeId),
          `${packageName}/${instance.typeId}`
        ).toBeDefined();
      }
    }
  });

  it("never persists an overlay declaration id as an instance typeId", async () => {
    const loadResult = await loadPackages(packagesDir, Catalog.empty());
    const packages = unwrapLoaderResult(loadResult).packages!;

    for (const packageName of migratedPackageNames) {
      const pkg = packages.find(candidate => candidate.name === packageName)!;
      const overlayDefinitionIds = new Set(
        pkg.domainTypes.getOverlayTypes().map(domainType => String(domainType.id))
      );

      for (const instance of pkg.instances.getAllInstances()) {
        expect(
          overlayDefinitionIds.has(String(instance.typeId)),
          `${packageName}/${instance.typeId}`
        ).toBe(false);
      }
    }
  });

  it("resolves every overlay's exact direct-source declaration", async () => {
    const loadResult = await loadPackages(packagesDir, Catalog.empty());
    const packages = unwrapLoaderResult(loadResult).packages!;
    const project = projectWithPackages(packages);

    for (const packageName of migratedPackageNames) {
      const pkg = packages.find(candidate => candidate.name === packageName)!;
      const dependencyClosure = project.dependencyGraph.getDependencyClosurePackageMap(pkg);

      for (const domainType of pkg.domainTypes.getOverlayTypes()) {
        const directSourcePackage = dependencyClosure.get(domainType.source.directSourcePackageId);
        expect(
          directSourcePackage,
          `${packageName}/${domainType.name}: ${domainType.source.directSourcePackageId}`
        ).toBeDefined();
        expect(
          directSourcePackage?.domainTypes.getById(domainType.source.directSourceTypeId),
          `${packageName}/${domainType.name}: ${domainType.source.directSourceTypeId}`
        ).toBeDefined();
      }
    }
  });
});
