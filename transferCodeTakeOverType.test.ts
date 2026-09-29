import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TRANSFER_CODE_TAKE_OVER_TYPE } from "./foundation-core-identity/dsl";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)));

interface DependencySurface {
  readonly types: Record<
    string,
    { readonly id: string; readonly properties: Record<string, string> }
  >;
}

const surface = JSON.parse(
  readFileSync(resolve(packageRoot, "foundation-core-identity/dsl/dependency-surface.json"), "utf8")
) as DependencySurface;
const takeOverSetting = surface.types.TakeOverSetting;

// Unity projects and installed dependencies never hold project instances and
// dominate the tree, so they are not walked.
const SKIPPED_DIRECTORIES = new Set(["node_modules", "unity"]);

function instanceFilesBelow(directoryPath: string, insideInstances: boolean): readonly string[] {
  if (!existsSync(directoryPath)) return [];
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(entry => {
    if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) return [];
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return instanceFilesBelow(entryPath, insideInstances || entry.name === "instances");
    }
    return insideInstances && entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

describe("transfer code take-over type", () => {
  // GS2-Account refuses password take-over for any type that has a
  // TakeOverTypeModel. A TakeOverSetting row (authored or overlaid) on the
  // transfer code's type would silently break issuing and using transfer codes.
  it("is never used by a TakeOverSetting instance in any project", () => {
    expect(takeOverSetting).toBeDefined();
    const typePropertyId = takeOverSetting.properties.type;
    expect(typePropertyId).toBeDefined();

    const collisions: string[] = [];
    let takeOverSettingInstanceCount = 0;
    for (const filePath of instanceFilesBelow(packageRoot, false)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        readonly typeId?: unknown;
        readonly values?: Record<string, unknown>;
        readonly overrides?: Record<string, unknown>;
      };
      if (raw.typeId !== takeOverSetting.id) continue;
      takeOverSettingInstanceCount += 1;
      const type = (raw.values ?? raw.overrides ?? {})[typePropertyId];
      if (type === TRANSFER_CODE_TAKE_OVER_TYPE) {
        collisions.push(relative(packageRoot, filePath));
      }
    }

    expect(takeOverSettingInstanceCount).toBeGreaterThan(0);
    expect(collisions).toEqual([]);
  });
});
