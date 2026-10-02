import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type MaterializedLocalizedDisplay = Readonly<
  Record<string, { readonly label?: string; readonly description?: string; readonly unit?: string }>
>;

interface MaterializedProperty {
  readonly name: string;
  readonly localizedDisplay?: MaterializedLocalizedDisplay;
}

interface MaterializedDomainType {
  readonly name: string;
  readonly localizedDisplay?: MaterializedLocalizedDisplay;
  readonly declared?: { readonly properties?: readonly MaterializedProperty[] };
}

function hasJaEnLabelAndDescription(display: MaterializedLocalizedDisplay | undefined): boolean {
  const ja = display?.ja;
  const en = display?.en;
  return Boolean(ja?.label && ja.description && en?.label && en.description);
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("materialized package localized display coverage", () => {
  it("provides Japanese and English labels and descriptions for every authored type and field", () => {
    const packageNames = readdirSync(packageRoot).filter(packageName =>
      existsSync(resolve(packageRoot, packageName, "dsl", "index.ts"))
    );
    const missing: string[] = [];
    let domainTypeCount = 0;
    let propertyCount = 0;

    for (const packageName of packageNames) {
      const domainTypesDir = resolve(
        packageRoot,
        packageName,
        "packages",
        packageName,
        "domain-types"
      );
      for (const fileName of readdirSync(domainTypesDir).filter(fileName =>
        fileName.endsWith(".json")
      )) {
        domainTypeCount += 1;
        const domainType = JSON.parse(
          readFileSync(resolve(domainTypesDir, fileName), "utf8")
        ) as MaterializedDomainType;
        if (!hasJaEnLabelAndDescription(domainType.localizedDisplay)) {
          missing.push(`${packageName}:${domainType.name}`);
        }
        for (const property of domainType.declared?.properties ?? []) {
          propertyCount += 1;
          if (!hasJaEnLabelAndDescription(property.localizedDisplay)) {
            missing.push(`${packageName}:${domainType.name}.${property.name}`);
          }
        }
      }
    }

    expect(packageNames).toHaveLength(32);
    expect(domainTypeCount).toBe(79);
    expect(propertyCount).toBe(330);
    expect(missing).toEqual([]);
  });
});
