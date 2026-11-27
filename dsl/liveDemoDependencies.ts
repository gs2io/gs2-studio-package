/** Every live demo package sits at `<featureId>/live-demo/packages/<featureId>-demo`, four folders below the repository root. */
const REPOSITORY_ROOT = "../../../..";
const DEMO_SUFFIX = "-demo";

/**
 * The `dependencies` of a live demo package: each package as a `file:` folder of this repository, so the demo reads its
 * dependencies from the checkout it ships in rather than from a pinned commit. A `<featureId>-demo` id names that feature's
 * live demo package; any other id names a feature package.
 */
export function liveDemoDependencies(...packageIds: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    packageIds.map(packageId => {
      const featureId = packageId.endsWith(DEMO_SUFFIX)
        ? packageId.slice(0, -DEMO_SUFFIX.length)
        : undefined;
      const folder =
        featureId === undefined
          ? `${packageId}/packages/${packageId}`
          : `${featureId}/live-demo/packages/${packageId}`;
      return [packageId, `file:${REPOSITORY_ROOT}/${folder}`];
    })
  );
}
