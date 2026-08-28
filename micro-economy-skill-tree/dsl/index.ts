import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/**
 * One node of a skill tree: what it costs to unlock, what must already be
 * unlocked before it, and how much of the cost comes back if it is reset.
 * Whether a node is released is per-player state.
 */
const SkillNode = defineDomainType("SkillNode", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.prop("releaseConsumeActions", PT.listOf(PT.consumeAction()))
        .masterData()
        .required()
        .description("What unlocking this node costs")
    )
    .property(
      PT.prop("premiseNodes", PT.listOf(PT.string()))
        .masterData()
        .description("Nodes that must be released first")
    )
    .property(
      PT.float32("restrainReturnRate")
        .masterData()
        .description("Share of the cost refunded when the node is reset")
    )
    .property(PT.bool("released").userData().required().description("Unlocked by this player"))
);

/**
 * The thing a tree hangs off — a character, a weapon, the player themselves.
 * GS2-SkillTree keys progress by an opaque property id, so what that id means
 * is the project's choice.
 */
const SkillTreeOwner = defineDomainType("SkillTreeOwner", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("propertyId").userData().required().description("Whose tree this progress is")
    )
);

const NodeModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.skillTree.NodeModel)
    .mountLocal(SkillNode)
    .bindings({
      name: Bind.domainProperty(Source.direct(SkillNode, "id")),
      metadata: Bind.static(""),
      restrainReturnRate: Bind.domainProperty(Source.direct(SkillNode, "restrainReturnRate")),
      premiseNodeNames: Bind.domainProperty(Source.direct(SkillNode, "premiseNodes")),
    })
    .addArrayChild("releaseConsumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(SkillNode)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(SkillNode, "releaseConsumeActions"))
          ),
        });
    })
);

export const microEconomySkillTree = definePackage("micro-economy-skill-tree", "0.0.0")
  .display({
    label: { ja: "スキルツリー", en: "Skill Tree" },
    description: {
      ja: "前提条件と解放コストを持つノードを辿って能力を解放します。解放済みノードはプレイヤーごとに記録されます。",
      en: "Unlocks abilities node by node, each with its own prerequisites and cost, tracked per player.",
    },
  })
  .displayType(SkillNode, {
    label: { ja: "スキルノード", en: "Skill node" },
    description: {
      ja: "スキルツリー上の能力、解放条件、前提ノードを設定します。",
      en: "Defines an ability node, its unlock cost, and prerequisite nodes in a skill tree.",
    },
  })
  .displayType(SkillTreeOwner, {
    label: { ja: "スキルツリー所有者", en: "Tree owner" },
    description: {
      ja: "キャラクターなどの対象ごとに解放済みスキルノードを管理します。",
      en: "Tracks unlocked skill nodes for an owner such as a character.",
    },
  })
  .domainType(SkillNode)
  .domainType(SkillTreeOwner)

  .masterDataResource(r =>
    r
      .model(GS2.skillTree.Namespace)
      .bindings({
        name: Bind.static("SkillTree"),
        releaseScript: Bind.null(),
        restrainScript: Bind.null(),
        logSetting: Bind.null(),
        transactionSetting: {
          acquireActionUseJobQueue: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          enableAtomicCommit: Bind.static(false),
          enableAutoRun: Bind.static(false),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
          transactionUseDistributor: Bind.static(false),
        },
      })
      .addChild(NodeModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.skillTree.Status)
      .mountLocal(SkillTreeOwner)
      .bindings({
        propertyId: Bind.domainProperty(Source.direct(SkillTreeOwner, "propertyId")),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      })
      .arrayMembershipMapping("releasedNodeNames", SkillNode, "id", "released")
  )

  .actionTransform("ReleaseSkillNode", at =>
    at
      .category("acquire")
      .parameter("propertyId", { type: PT.string() })
      .parameter("node", { type: PT.ref("SkillNode") })
      .output("Gs2SkillTree:MarkReleaseByUserId", o =>
        o
          .resourceRef(() => NodeModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("nodeModelNames[0]", "node")
      )
  )
  .actionTransform("RestrainSkillNode", at =>
    at
      .category("consume")
      .parameter("propertyId", { type: PT.string() })
      .parameter("node", { type: PT.ref("SkillNode") })
      .output("Gs2SkillTree:MarkRestrainByUserId", o =>
        o
          .resourceRef(() => NodeModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("propertyId", "propertyId")
          .mapParameter("nodeModelNames[0]", "node")
      )
  )
  .build();
