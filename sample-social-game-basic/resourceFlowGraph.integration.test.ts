/**
 * sample-social-game-basic resourceFlowGraph integration test
 *
 * Loads the real on-disk sample project and runs
 * `buildInstanceLevelFlowGraph` against it. The goal is to surface what the
 * resource flow graph actually produces for a non-trivial project — node /
 * edge / diagnostic counts — so that "no edges shown in the Economy Viewer"
 * type symptoms can be diagnosed via this test instead of by inspecting the
 * UI manually.
 */

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

    // 観測ログ: Diagnostics の切り分け用にコンソール出力（テストランナーに残る）

    console.log("[resourceFlowGraph summary]", JSON.stringify(summary, null, 2));

    // ---------- 構造的な期待 ----------
    // 何らかのリソースノードがあること
    expect(summary.resourceNodes, "resource nodes present").toBeGreaterThan(0);
    // クラスタが生成される
    expect(summary.clusters, "clusters present").toBeGreaterThan(0);
    // realtime 外部ソースノードは必ず 1 つ生成される
    expect(summary.externalSourceNodes, "external source node").toBe(1);
  });

  it("reports whether instance flows are collected (instance nodes / edges count)", async () => {
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);
    const graph = buildInstanceLevelFlowGraph({ project, catalog });
    const summary = summarize(graph);

    // この 2 値が 0 か否かで「Economy Viewer にエッジが出ない」根本原因の場所を特定できる:
    //   instanceNodes > 0 → instance は materialize されている
    //   edges > 0 → flow も収集されている (UI 側の表示問題に絞り込める)
    //   instanceNodes === 0 → collectInstanceFlows の gate (mountPath/typeName/actions) で
    //                          全 resource が早期 return された (実プロジェクトでは想定外)
    //   instanceNodes > 0 && edges === 0 → action property の materialize で
    //                                      transform 経由などが失敗 (unresolvedTransform 等)
    // host overlay 適用後の期待値:
    // - 依存パッケージに owned された resource でもホストのスコープで view が
    //   resolve され、action property / transform が見えてフローが収集される
    // - したがって instance ノードもエッジも 0 にはならない
    expect(summary.instanceNodes, "instance nodes from host-overlay-visible flows").toBeGreaterThan(
      0
    );
    expect(summary.edges, "flow edges collected").toBeGreaterThan(0);

    // テストランナーが落ちなくても、CI ログから生の値を読みたいので残しておく

    console.log(
      `[flow stats] instances=${summary.instanceNodes} edges=${summary.edges} ` +
        `(acquire=${summary.acquireEdges} consume=${summary.consumeEdges}) ` +
        `targetPlaceholders=${summary.targetPlaceholders}`
    );
  });

  it("inspects resolved views for local-mounted resources (action properties + transforms)", async () => {
    // 「edges 0」が想定外な動きなのか、それともサンプル側の data shape 由来なのかを
    // 切り分けるための probe。local mount している各 resource について、resolved
    // view の effective properties / action property transforms を実際に列挙する。
    const [project, catalog] = await Promise.all([loadSampleProject(), loadRealCatalog()]);
    const { getDomainTypeViewReader } = await import("~/application/domainType");
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
        const view = reader.getResolvedView(pkg, mp.typeName);
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

    // 集計: kind 別に出現したプロパティ kind の合計
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
    // サンプル別 (Gacha のような action property transforms を持つ既知型)
    const gachaSnapshots = snapshots.filter(s => s.typeName === "Gacha");
    if (gachaSnapshots.length > 0) {
      console.log("[view probe] Gacha snapshots:", JSON.stringify(gachaSnapshots, null, 2));
    }

    // この test は probe なので fail させない。可視化のためのログ出力のみ。
    expect(snapshots.length).toBeGreaterThan(0);

    // 追加 probe: resource を所有している pkg ではなく、ホスト
    // (sample-social-game-basic) のスコープで Gacha view を resolve するとどう
    // 見えるかを確認する。overlay/transform がここで初めて見えるかどうか。
    const hostPkg = [...project.packages.values()].find(
      p => (p.name as string) === "sample-social-game-basic"
    );
    if (hostPkg) {
      const { DomainTypeName } = await import("~/domain/core");
      const hostView = reader.getResolvedView(hostPkg, DomainTypeName.trusted("Gacha"));
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

    // These diagnostic categories distinguish the main failure sources; values
    // greater than zero appear in the UI's Diagnostics list.
    const nodeKinds = summary.nodeDiagnosticCountsByKind;
    const edgeKinds = summary.edgeDiagnosticCountsByKind;

    console.log("[node diagnostics]", nodeKinds);

    console.log("[edge diagnostics]", edgeKinds);

    // Check the hypothesis that an unresolved ActionTransform removes the flow:
    //   - unresolvedTransform > 0 means a transform was not found in a dependency package.
    //   - unresolvedBindingSource > 0 means a ValueBinding target was not resolved.
    //   - If edges === 0 and both counts are zero, action-property materialization
    //     was not invoked and the gate skipped the case.
    // Do not pin the exact counts because sample updates can change them; the
    // values remain in CI logs for regression tracing.
    expect(typeof nodeKinds).toBe("object");
    expect(typeof edgeKinds).toBe("object");
  });
});
