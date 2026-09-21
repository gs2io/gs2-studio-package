import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const character = dependencyPackage(characterSurface);

/** The property inside `foundation-economy-character` this package keys on. */
const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

/**
 * One node of a skill tree: what it costs to unlock, what must already be
 * unlocked before it, and how much of the cost comes back if it is reset.
 * Whether a node is released is per-player state.
 */
const SkillNode = defineDomainType("SkillNode", dt =>
  dt
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
    // Which character's tree this row is being read for. It is a scope, not a
    // per-node fact: the list of nodes is the same for everyone, and the
    // released flags are only meaningful once a character is chosen. Leaving
    // the binding hint at `none` is what makes the generator take it as a
    // runtime scope argument — marking it `userData` would seed it from a
    // master axis that has no character, and the loader would never run.
    .property(PT.string("owner").description("Whose tree these flags are read for"))
    .localizedProperties({
      id: jaEnId("スキルノード", "skill node"),
      releaseConsumeActions: jaEnField(
        "解放コスト",
        "Unlock costs",
        "このノードを解放するときに実行する消費アクションです。",
        "Consume actions executed to unlock this node."
      ),
      premiseNodes: jaEnField(
        "前提ノード",
        "Prerequisite nodes",
        "先に解放しておく必要があるノードの一覧です。",
        "Nodes that must be unlocked before this node."
      ),
      restrainReturnRate: jaEnField(
        "リセット返却率",
        "Reset refund rate",
        "ノードをリセットしたときに解放コストを返却する割合です。",
        "Share of the unlock cost refunded when the node is reset.",
        { ja: "倍", en: "ratio" }
      ),
      released: jaEnField(
        "解放済み",
        "Unlocked",
        "プレイヤーがこのノードを解放済みかを示します。",
        "Whether the player has unlocked this node."
      ),
      owner: jaEnField(
        "対象キャラクター",
        "Owning character",
        "解放状況を読み出す対象のキャラクターを指す識別子です。",
        "Identifier of the character whose unlock state these flags are read for."
      ),
    })
);

/**
 * The character a tree hangs off.
 *
 * GS2-SkillTree keys progress by an opaque property id, and this package spends
 * the same value the rest of the character packages do — the character's
 * Inventory ItemSet GRN, which `foundation-economy-character` fills per row.
 */
const Character = defineOverlayDomainType("Character", character.overlay("Character"), domainType =>
  domainType
    .property(
      PT.prop("releasedSkillNodes", PT.listOf(PT.string()))
        .userData()
        .description("Skill nodes this character has unlocked")
    )
    .localizedProperties({
      releasedSkillNodes: jaEnField(
        "解放済みスキルノード",
        "Unlocked skill nodes",
        "このキャラクターが解放済みのスキルノードの一覧です。",
        "Skill nodes this character has already unlocked."
      ),
    })
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

export const microEconomySkillTree = definePackage("micro-economy-skill-tree", "0.1.0")
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
  .displayType(Character, {
    label: { ja: "キャラクター", en: "Character" },
    description: {
      ja: "キャラクターごとに解放済みスキルノードを管理します。",
      en: "Tracks unlocked skill nodes per character.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(SkillNode)
  .domainType(Character)

  .masterDataResource(r =>
    r
      .model(GS2.skillTree.Namespace)
      .bindings({
        name: Bind.static("SkillTree"),
        ...Bind.nulls("releaseScript", "restrainScript", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(NodeModel)
  )

  // The same GS2 row is read twice because it answers two different questions,
  // and each answer is keyed from a different model. A `propertyId` binding
  // resolves against the effective properties of the binder being generated, so
  // one resource cannot serve both: `CharacterBinder` carries
  // `Character.propertyId`, `SkillNodeBinder` carries `SkillNode.owner`, and no
  // two types share a PropertyId.
  //
  // Read #1 — the character's own view, the shape `experience` already uses.
  .userDataResource(r =>
    r
      .model(GS2.skillTree.Status)
      .linkedMasterResourceId(NodeModel)
      .mountLocal(Character)
      .bindings({
        // An overlay's inherited properties have no local name, so the source
        // PropertyId is written directly.
        propertyId: Bind.domainProperty(Source.direct("Character", CHARACTER_PROPERTY_ID)),
        releasedNodeNames: Bind.domainProperties([Source.direct(Character, "releasedSkillNodes")]),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // Read #2 — the per-node view. Unmounted on purpose: it writes flags onto
  // `SkillNode` rows through the membership mapping rather than onto a type it
  // is mounted on, and its key comes from the scope the node list is shown for.
  .userDataResource(r =>
    r
      .model(GS2.skillTree.Status)
      .linkedMasterResourceId(NodeModel)
      .bindings({
        propertyId: Bind.domainProperty(Source.direct(SkillNode, "owner")),
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
