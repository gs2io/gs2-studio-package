import {
  ActionProgram,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSettingV2,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

const SkillNode = defineDomainType("SkillNode", dt =>
  dt
    .property(
      PT.prop("releaseConsumeActions", PT.listOf(PT.consumeAction())).masterData().required()
    )
    .property(PT.prop("premiseNodes", PT.listOf(PT.string())).masterData())
    .property(PT.float32("restrainReturnRate").masterData())
    .property(PT.bool("released").userData().required())
    // Leave storage unset so owner is a runtime scope argument; the shared node master rows cannot supply a character identity.
    .property(PT.string("owner"))
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

const Character = defineOverlayDomainType("Character", character.overlay("Character"), domainType =>
  domainType
    .property(PT.prop("releasedSkillNodes", PT.listOf(PT.string())).userData())
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
        .actionProgram(
          ActionProgram.domainProperty(
            Source.parent(Source.direct(SkillNode, "releaseConsumeActions"))
          )
        );
    })
);

export const microEconomySkillTree = definePackage("micro-economy-skill-tree", "0.0.0")
  .display({
    ja: {
      label: "スキルツリー",
      description:
        "前提条件と解放コストを持つノードを辿って能力を解放します。解放済みノードはキャラクターごとに記録されます。",
    },
    en: {
      label: "Skill Tree",
      description:
        "Unlocks abilities node by node, each with its own prerequisites and cost, tracked per character.",
    },
  })
  .displayType(SkillNode, {
    ja: {
      label: "スキルノード",
      description: "スキルツリー上の能力、解放条件、前提ノードを設定します。",
    },
    en: {
      label: "Skill node",
      description:
        "Defines an ability node, its unlock cost, and prerequisite nodes in a skill tree.",
    },
  })
  .displayType(Character, {
    ja: {
      label: "キャラクター",
      description: "キャラクターごとに解放済みスキルノードを管理します。",
    },
    en: { label: "Character", description: "Tracks unlocked skill nodes per character." },
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
        transactionSettingV2: transactionSettingV2(),
      })
      .addChild(NodeModel)
  )

  // Separate resources are needed because Character.propertyId and SkillNode.owner belong to different binders and property identities.
  .userDataResource(r =>
    r
      .model(GS2.skillTree.Status)
      .linkedMasterResourceId(NodeModel)
      .mountLocal(Character)
      .bindings({
        // Use the dependency's PropertyId to preserve inherited identity in this overlay.
        propertyId: Bind.domainProperty(Source.direct("Character", CHARACTER_PROPERTY_ID)),
        releasedNodeNames: Bind.domainProperties([Source.direct(Character, "releasedSkillNodes")]),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // Leave this resource unmounted because membership mapping writes the scoped result onto SkillNode rows.
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
