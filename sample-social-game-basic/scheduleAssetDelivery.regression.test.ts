/**
 * Regression test for: "Schedule: assetDelivery properties declared but no
 * instances found — entry class emitted with no .asset payloads" warning
 * when generating C# code for foundation-economy-schedule.
 *
 * Schedule is declared in `foundation-economy-schedule` with the `trigger`
 * property bound through `assetDelivery`. The single Schedule instance
 * (`login-bonus-event`) is authored against an explicit Schedule overlay in
 * the consumer package `sample-social-game-basic`. The owning package emits
 * the overlay entry, so reverse-dependent collection must follow that
 * overlay's canonical source and find the consumer instance. Otherwise the
 * entry class is emitted with no `.asset` payloads and a spurious warning
 * fires.
 */
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

    // Production path: generateAllPackagesCSharp builds the project-wide canonical
    // registry. Single-package generatePackageCSharp includes direct reverse dependents
    // as additional hosts for dependency-target resolution, so host-authored
    // instances are reachable via identityByPackageDependencyTarget without
    // affecting canonical-emitter selection.
    const genResult = generateAllPackagesCSharp({ project, catalog });
    expect(Result.isSuccess(genResult)).toBe(true);
    if (!Result.isSuccess(genResult)) return;
    const entry = genResult.value.succeeded.find(
      e => e.packageName === "foundation-economy-schedule"
    );
    expect(entry, "foundation-economy-schedule codegen entry").toBeDefined();
    if (!entry) return;

    // The "no instances found" diagnostic must NOT be reported: the consumer
    // instance `login-bonus-event` should satisfy the entry class.
    const noInstancesWarning = entry.artifacts.warnings.find(
      w =>
        w.code === "codegen.scriptableObject" &&
        w.message.includes("Schedule") &&
        w.message.includes("no instances found")
    );
    expect(noInstancesWarning, "scriptableObject no-instances warning").toBeUndefined();

    // The Schedule overlay entry must be emitted in the owning package output.
    const scheduleEntry = entry.artifacts.files.find(f => f.fileName === "ScheduleOverlayEntry.cs");
    expect(scheduleEntry, "ScheduleOverlayEntry.cs").toBeDefined();

    // The per-instance .asset payload must be emitted under the type folder.
    const asset = entry.artifacts.files.find(
      f => f.fileName === "Overlays/Schedule/login-bonus-event.asset"
    );
    expect(asset, "Overlays/Schedule/login-bonus-event.asset").toBeDefined();
  });
});
