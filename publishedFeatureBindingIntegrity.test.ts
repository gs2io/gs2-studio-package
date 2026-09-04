import { describe, expect, it } from "vitest";

import { collectPackageValidationDetails } from "~/application/integrity";
import { loadAllPublishedFeatureProjectForTest } from "~/testing/package";

describe("published feature binding integrity", () => {
  it("binds every authored master-data and user-data property", async () => {
    const { catalog, project } = await loadAllPublishedFeatureProjectForTest();
    const unboundProperties: string[] = [];

    for (const pkg of project.packages) {
      const status = collectPackageValidationDetails({
        pkg,
        catalog,
        project,
      }).packageIntegrityStatus;
      for (const [domainTypeId, propertyIds] of status.typeProperties
        .unboundBindingHintProperties) {
        for (const propertyId of propertyIds) {
          unboundProperties.push(`${pkg.id}/${domainTypeId}/${propertyId}`);
        }
      }
    }

    expect(unboundProperties).toEqual([]);
  });
});
