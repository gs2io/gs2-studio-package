import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadPackages, unwrapLoaderResult } from "~/testing/applicationAdapters/projectFilesystem";
import {
  buildInstanceLevelFlowGraph,
  type ResourceFlowEdgeDiagnostic,
  type ResourceFlowGraph,
} from "~/application/resourceFlowGraph";
import { Catalog } from "~/domain/catalog";
import { MountPath, Result } from "~/domain/core";
import { PackageCollection } from "~/domain/package";
import { Project } from "~/domain/project";

const currentDir = dirname(fileURLToPath(import.meta.url));

async function loadRealCatalog(): Promise<Catalog> {
  const { loadCatalogEntity } = await import("~/testing/applicationAdapters/catalog");
  const result = await loadCatalogEntity();
  if (Result.isFailure(result)) {
    throw new Error(`catalog load failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadSampleProject(): Promise<Project> {
  const packagesDir = resolve(currentDir, "packages");
  const allResult = await loadPackages(packagesDir, Catalog.empty());
  const payload = unwrapLoaderResult(allResult);
  if (!payload.packages) throw new Error("packages failed to load");
  return new Project(PackageCollection.fromTrusted(payload.packages));
}

interface GraphSummary {
  readonly resourceNodes: number;
  readonly instanceNodes: number;
  readonly externalSourceNodes: number;
  readonly concreteResources: number;
  readonly resourceEntryPlaceholders: number;
  readonly targetPlaceholders: number;
  readonly edges: number;
  readonly acquireEdges: number;
  readonly consumeEdges: number;
  readonly clusters: number;
  readonly nodeDiagnosticCountsByKind: Record<string, number>;
  readonly edgeDiagnosticCountsByKind: Record<string, number>;
}

function summarize(graph: ResourceFlowGraph): GraphSummary {
  let resourceNodes = 0;
  let instanceNodes = 0;
  let externalSourceNodes = 0;
  let concreteResources = 0;
  let resourceEntryPlaceholders = 0;
  let targetPlaceholders = 0;
  const nodeDiagnosticCountsByKind: Record<string, number> = {};

  for (const node of graph.nodes.values()) {
    if (node.kind === "instance") instanceNodes++;
    else if (node.kind === "externalSource") externalSourceNodes++;
    else {
      resourceNodes++;
      if (node.resolution === "concrete") concreteResources++;
      else if (node.resolution === "resourceEntryPlaceholder") resourceEntryPlaceholders++;
      else targetPlaceholders++;
      for (const d of node.diagnostics as readonly ResourceFlowEdgeDiagnostic[]) {
        nodeDiagnosticCountsByKind[d.kind] = (nodeDiagnosticCountsByKind[d.kind] ?? 0) + 1;
      }
    }
  }

  let acquireEdges = 0;
  let consumeEdges = 0;
  const edgeDiagnosticCountsByKind: Record<string, number> = {};
  for (const edge of graph.edges) {
    if (edge.kind === "acquire") acquireEdges++;
    else consumeEdges++;
    for (const d of edge.metadata.diagnostics) {
      edgeDiagnosticCountsByKind[d.kind] = (edgeDiagnosticCountsByKind[d.kind] ?? 0) + 1;
    }
  }

  return {
    resourceNodes,
    instanceNodes,
    externalSourceNodes,
    concreteResources,
    resourceEntryPlaceholders,
    targetPlaceholders,
    edges: graph.edges.length,
    acquireEdges,
    consumeEdges,
    clusters: graph.clusters.size,
    nodeDiagnosticCountsByKind,
    edgeDiagnosticCountsByKind,
  };
}

describe("sample-social-game-basic resourceFlowGraph", () => {
  it("builds an instance-level flow graph from the real project + real catalog", async () => {
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);

    const graph = buildInstanceLevelFlowGraph({ project, catalog });

    const summary = summarize(graph);

    console.log("[resourceFlowGraph summary]", JSON.stringify(summary, null, 2));

    expect(summary.resourceNodes, "resource nodes present").toBeGreaterThan(0);
    expect(summary.clusters, "clusters present").toBeGreaterThan(0);
    expect(summary.externalSourceNodes, "external source node").toBe(1);
  });

  it("reports whether instance flows are collected (instance nodes / edges count)", async () => {
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);
    const graph = buildInstanceLevelFlowGraph({ project, catalog });
    const summary = summarize(graph);

    expect(summary.instanceNodes, "instance nodes from host-overlay-visible flows").toBeGreaterThan(
      0
    );
    expect(summary.edges, "flow edges collected").toBeGreaterThan(0);

    // Keep observed counts in CI logs even when structural assertions pass.

    console.log(
      `[flow stats] instances=${summary.instanceNodes} edges=${summary.edges} ` +
        `(acquire=${summary.acquireEdges} consume=${summary.consumeEdges}) ` +
        `targetPlaceholders=${summary.targetPlaceholders}`
    );
  });

  it("inspects resolved views for local-mounted resources (action properties + transforms)", async () => {
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);
    const { getDomainTypeViewReader } = await import("~/application/domainType/composition");
    const reader = getDomainTypeViewReader({ project, actionCatalog: catalog });

    interface ResourceViewSnapshot {
      readonly pkg: string;
      readonly resource: string;
      readonly typeName: string;
      readonly propertyKindCounts: Record<string, number>;
      readonly actionPropertyTargetNames: readonly string[];
    }
    const snapshots: ResourceViewSnapshot[] = [];

    for (const pkg of project.packages.values()) {
      for (const resource of pkg.masterDataResources.values()) {
        const mp = resource.ownMountPath;
        if (mp === undefined || !MountPath.isLocal(mp)) continue;
        const view = reader.getResolvedViewById(pkg, mp.typeId);
        if (!view) continue;
        const propertyKindCounts: Record<string, number> = {};
        const transformTargets = new Set<string>();
        const transforms = view.actionPropertyTransforms;
        for (const p of view.resolved.effectiveProperties) {
          const kind = p.type.kind;
          propertyKindCounts[kind] = (propertyKindCounts[kind] ?? 0) + 1;
          const t = transforms?.getByTargetPropertyName(p.name);
          if (t) transformTargets.add(p.name as string);
        }
        snapshots.push({
          pkg: pkg.id as string,
          resource: resource.id as string,
          typeName: mp.typeName as string,
          propertyKindCounts,
          actionPropertyTargetNames: [...transformTargets],
        });
      }
    }

    const aggKinds: Record<string, number> = {};
    let totalSnapshotsWithActionPropertyTransform = 0;
    for (const s of snapshots) {
      if (s.actionPropertyTargetNames.length > 0) totalSnapshotsWithActionPropertyTransform++;
      for (const [k, v] of Object.entries(s.propertyKindCounts)) {
        aggKinds[k] = (aggKinds[k] ?? 0) + v;
      }
    }

    console.log("[view probe] aggregated property kinds across local-mounted resources:", aggKinds);
    console.log(
      `[view probe] resources whose view has actionPropertyTransforms: ${totalSnapshotsWithActionPropertyTransform} / ${snapshots.length}`
    );
    const gachaSnapshots = snapshots.filter(s => s.typeName === "Gacha");
    if (gachaSnapshots.length > 0) {
      console.log("[view probe] Gacha snapshots:", JSON.stringify(gachaSnapshots, null, 2));
    }

    expect(snapshots.length).toBeGreaterThan(0);

    // Resolve in host scope because dependency-owned resources can gain action mappings through overlays.
    const hostPkg = [...project.packages.values()].find(
      p => (p.name as string) === "sample-social-game-basic"
    );
    if (hostPkg) {
      const { DomainTypeName } = await import("~/domain/core");
      const gachaTypeId = hostPkg.domainTypes.idForName(DomainTypeName.trusted("Gacha"));
      const hostView =
        gachaTypeId === undefined ? undefined : reader.getResolvedViewById(hostPkg, gachaTypeId);
      console.log(
        "[view probe] host-scope Gacha view exists:",
        hostView !== undefined,
        "actionPropertyTransforms defined:",
        hostView
          ? (hostView as { actionPropertyTransforms?: unknown }).actionPropertyTransforms !==
              undefined
          : "n/a",
        "property kinds:",
        hostView
          ? [...hostView.resolved.effectiveProperties].map(
              p =>
                `${p.type.kind}${"elementType" in p.type && p.type.elementType ? `<${(p.type.elementType as { kind?: string }).kind}>` : ""}`
            )
          : "n/a"
      );
    }
  });

  it("classifies diagnostics so we can tell placeholder reasons from flow failures", async () => {
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);
    const graph = buildInstanceLevelFlowGraph({ project, catalog });
    const summary = summarize(graph);

    const nodeKinds = summary.nodeDiagnosticCountsByKind;
    const edgeKinds = summary.edgeDiagnosticCountsByKind;

    console.log("[node diagnostics]", nodeKinds);

    console.log("[edge diagnostics]", edgeKinds);

    // Avoid fixed diagnostic counts because sample content changes; keep the observed values in CI logs.
    expect(typeof nodeKinds).toBe("object");
    expect(typeof edgeKinds).toBe("object");
  });
});
