import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { Catalog } from "~/domain/catalog";
import { DomainTypeInstanceId, DomainTypeName, PropertyId, Result } from "~/domain/core";
import { PackageInstances } from "~/domain/package";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("StoreProduct overlay edit regression (sample-social-game-basic)", () => {
  it("writes against the canonical StoreProduct id without a declaration", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const allResult = await loadPackages(packagesDir, Catalog.empty());
    const payload = unwrapLoaderResult(allResult);
    const pkgs = payload.packages!;

    const samplePkg = pkgs.find(p => p.name === "sample-social-game-basic")!;
    if (!samplePkg.isEditable()) {
      throw new Error("sample-social-game-basic must load as an editable package");
    }

    expect(samplePkg.domainTypes.getByName(DomainTypeName.trusted("StoreProduct"))).toBeUndefined();

    const foundationCurrencyPkg = pkgs.find(p => p.name === "foundation-economy-currency")!;
    const storeProductType = foundationCurrencyPkg.domainTypes.getByName(
      DomainTypeName.trusted("StoreProduct")
    )!;
    const localStoreProductInstances = samplePkg.instances.getAuthoredValueInstancesByTypeId(
      storeProductType.id
    );
    const overlaysBefore = samplePkg.instances.getOverlaysByTypeId(storeProductType.id);
    const depsBefore = new Set([...samplePkg.dependencies].map(d => d.packageId as string));

    expect(depsBefore.has("micro-shop-currency")).toBe(true);
    expect(depsBefore.has("foundation-economy-currency")).toBe(false);

    // Choose an unused source ID so fixture-authored overlays cannot affect the mutation under test.
    const existingOverlayIds = new Set(overlaysBefore.map(o => o.sourceInstanceId as string));
    let targetId = "regression-target";
    let suffix = 0;
    while (existingOverlayIds.has(targetId)) {
      suffix += 1;
      targetId = `regression-target-${suffix}`;
    }

    const appleProductIdPropId = PropertyId.trusted("prop_2GHK1DAZ80TETBDER3P5PF6XKA");

    const result = PackageInstances.setOverlayOverride(
      samplePkg,
      storeProductType.id,
      DomainTypeInstanceId.trusted(targetId),
      appleProductIdPropId,
      "com.example.regression"
    );
    if (Result.isFailure(result)) {
      throw new Error("setOverlayOverride failed: " + JSON.stringify(result.error));
    }
    const updated = result.value.package;

    expect(updated.domainTypes.getByName(DomainTypeName.trusted("StoreProduct"))).toBeUndefined();
    expect(updated.instances.getAuthoredValueInstancesByTypeId(storeProductType.id)).toEqual(
      localStoreProductInstances
    );
    const depsAfter = new Set([...updated.dependencies].map(d => d.packageId as string));
    expect(depsAfter).toEqual(depsBefore);

    const overlaysAfter = updated.instances.getOverlaysByTypeId(storeProductType.id);
    expect(overlaysAfter.length).toBe(overlaysBefore.length + 1);
    const newOverlay = overlaysAfter.find(o => (o.sourceInstanceId as string) === targetId);
    expect(newOverlay).toBeDefined();
    expect(newOverlay!.overrides.get(appleProductIdPropId)).toBe("com.example.regression");
  });

  it("authors each store product's prices as elements on the product's own row", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const pkgs = unwrapLoaderResult(await loadPackages(packagesDir, Catalog.empty())).packages!;
    const samplePkg = pkgs.find(p => p.name === "sample-social-game-basic")!;
    const storeProductType = pkgs
      .find(p => p.name === "foundation-economy-currency")!
      .domainTypes.getByName(DomainTypeName.trusted("StoreProduct"))!;
    const storePriceType = pkgs
      .find(p => p.name === "micro-shop-currency")!
      .domainTypes.getByName(DomainTypeName.trusted("StorePrice"))!;

    const pricesPropId = PropertyId.trusted("prop_01M40RS7N08DEDFYE3YFC4TRYV");
    const currencyTypePropId = "prop_4F7GJCACK2YK78HYH2XVEEMN6R";
    const pricePropId = "prop_5F0WQDHQVNVH3DJAEMMFVJSJ2K";

    expect(samplePkg.instances.getAuthoredValueInstancesByTypeId(storePriceType.id)).toEqual([]);
    const pricesById = new Map(
      samplePkg.instances
        .getAuthoredValueInstancesByTypeId(storeProductType.id)
        .map(instance => [String(instance.id), instance.values.get(pricesPropId)])
    );
    expect(pricesById.get("tier1")).toEqual([
      { [currencyTypePropId]: "JPY", [pricePropId]: 100 },
      { [currencyTypePropId]: "USD", [pricePropId]: 1 },
      { [currencyTypePropId]: "XXX", [pricePropId]: 1 },
    ]);
    expect([...pricesById.keys()].sort()).toEqual(["tier1", "tier2", "tier3", "tier4", "tier5"]);
    for (const prices of pricesById.values()) {
      expect(prices).toHaveLength(3);
    }
  });
});
