import { describe, expect, it } from "vitest";

import { PackageValidationDetails } from "~/application/integrity";
import { loadAllPublishedFeatureProjectForTest } from "~/testing/package";

describe("published feature binding integrity", () => {
  it("binds every authored master-data and user-data property", async () => {
    const { catalog, project } = await loadAllPublishedFeatureProjectForTest();
    const unboundProperties: string[] = [];

    for (const pkg of project.packages) {
      const details = PackageValidationDetails.collect({
        pkg,
        catalog,
        project,
      });
      for (const domainType of pkg.domainTypes) {
        for (const propertyId of details.inspectDomainType(domainType.id).unboundPropertyIds) {
          unboundProperties.push(`${pkg.id}/${domainType.id}/${propertyId}`);
        }
      }
    }

    expect(unboundProperties).toEqual([]);
  });
});
