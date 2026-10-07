/** The Schedule instance belongs to a downstream consumer overlay; generation must follow canonical identity to include its asset in the owning package. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateAllPackagesCSharp } from "~/application/codegen";
import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import { Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";
import { loadRealCatalog } from "~/testing/codegen/loadRealCatalog";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("Schedule assetDelivery codegen regression (foundation-economy-schedule)", () => {
  it("emits per-instance .asset payloads for Schedule instances authored in the consumer package", async () => {
    const packagesDir = resolve(currentDir, "packages");
    const catalog = loadRealCatalog();
    const allResult = await loadPackages(packagesDir, catalog);
    const payload = unwrapLoaderResult(allResult);
    const pkgs = payload.packages!;

    expect(
      pkgs.some(p => p.name === "foundation-economy-schedule"),
      "foundation-economy-schedule must be reachable"
    ).toBe(true);

    const project = new Project(PackageCollection.fromTrusted(pkgs));

    const genResult = generateAllPackagesCSharp({ project, catalog });
    expect(Result.isSuccess(genResult)).toBe(true);
    if (!Result.isSuccess(genResult)) return;
    const entry = genResult.value.succeeded.find(
      e => e.packageName === "foundation-economy-schedule"
    );
    expect(entry, "foundation-economy-schedule codegen entry").toBeDefined();
    if (!entry) return;

    const noInstancesWarning = entry.artifacts.warnings.find(
      w =>
        w.code === "codegen.scriptableObject" &&
        w.message.includes("Schedule") &&
        w.message.includes("no instances found")
    );
    expect(noInstancesWarning, "scriptableObject no-instances warning").toBeUndefined();

    const scheduleEntry = entry.artifacts.files.find(f => f.fileName === "ScheduleOverlayEntry.cs");
    expect(scheduleEntry, "ScheduleOverlayEntry.cs").toBeDefined();

    // Resources must contain the payload so the player-time overlay loader can find it.
    const asset = entry.artifacts.files.find(
      f => f.fileName === "Resources/Overlays/Schedule/login-bonus-event.asset"
    );
    expect(asset, "Resources/Overlays/Schedule/login-bonus-event.asset").toBeDefined();
  });
});
