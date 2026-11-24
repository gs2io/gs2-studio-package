import {
  ActionProgram,
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

const SkillNode = defineDomainType("SkillNode", {
  properties: {
    releaseConsumeActions: PT.listOf(PT.consumeAction()).masterData().required(),
    premiseNodes: PT.listOf(PT.string()).masterData(),
    restrainReturnRate: PT.float32().masterData(),
    released: PT.bool().userData().required(),
    owner: PT.string(),
  },
  localizedDisplay: {
    ja: {
      label: "スキルノード",
      description: "スキルツリー上の能力、解放条件、前提ノードを設定します。",
    },
    en: {
      label: "Skill node",
      description:
        "Defines an ability node, its unlock cost, and prerequisite nodes in a skill tree.",
    },
  },
  localizedProperties: {
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
    },
});

const Character = defineOverlayDomainType("Character", character.overlay("Character"), {
  properties: {
    releasedSkillNodes: PT.listOf(PT.string()).userData(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター",
      description: "キャラクターごとに解放済みスキルノードを管理します。",
    },
    en: { label: "Character", description: "Tracks unlocked skill nodes per character." },
  },
  localizedProperties: {
      releasedSkillNodes: jaEnField(
        "解放済みスキルノード",
        "Unlocked skill nodes",
        "このキャラクターが解放済みのスキルノードの一覧です。",
        "Skill nodes this character has already unlocked."
      ),
    },
});

const NodeModel = defineMasterDataResource({
  model: GS2.skillTree.NodeModel,
  mount: SkillNode,
  bindings: {
      name: Bind.domainProperty(Source.direct(SkillNode, "id")),
      metadata: Bind.static(""),
      restrainReturnRate: Bind.domainProperty(Source.direct(SkillNode, "restrainReturnRate")),
      premiseNodeNames: Bind.domainProperty(Source.direct(SkillNode, "premiseNodes")),
    },
  arrayChildren: {
    releaseConsumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: SkillNode,
  actionProgram: ActionProgram.domainProperty(
            Source.parent(Source.direct(SkillNode, "releaseConsumeActions"))
          ),
}),
    ],
  },
});

const ReleaseSkillNodeTransform = defineActionTransform("ReleaseSkillNode", {
  category: "acquire",
  parameters: {
    propertyId: { type: PT.string() },
    node: { type: PT.ref(SkillNode) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2SkillTree:MarkReleaseByUserId",
    resource: () => NodeModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      propertyId: OutputMap.parameter("propertyId"),
      "nodeModelNames[0]": OutputMap.parameter("node"),
    },
  },
  ],
});

const RestrainSkillNodeTransform = defineActionTransform("RestrainSkillNode", {
  category: "consume",
  parameters: {
    propertyId: { type: PT.string() },
    node: { type: PT.ref(SkillNode) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2SkillTree:MarkRestrainByUserId",
    resource: () => NodeModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      propertyId: OutputMap.parameter("propertyId"),
      "nodeModelNames[0]": OutputMap.parameter("node"),
    },
  },
  ],
});

export const microEconomySkillTree = definePackage({
  id: "micro-economy-skill-tree",
  version: "0.0.1",
  display: {
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
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [SkillNode, Character],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.skillTree.Namespace,
  bindings: {
        name: Bind.static("SkillTree"),
        ...Bind.nulls("releaseScript", "restrainScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    NodeModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.skillTree.Status,
  mount: Character,
  linkedMaster: NodeModel,
  bindings: {
        // Use the dependency's PropertyId to preserve inherited identity in this overlay.
        propertyId: Bind.domainProperty(Source.direct(Character, CHARACTER_PROPERTY_ID)),
        releasedNodeNames: Bind.domainProperties([Source.direct(Character, "releasedSkillNodes")]),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
    defineUserDataResource({
  model: GS2.skillTree.Status,
  linkedMaster: NodeModel,
  bindings: {
        propertyId: Bind.domainProperty(Source.direct(SkillNode, "owner")),
        statusId: Bind.skip(),
        userId: Bind.skip(),
      },
  arrayMembershipMappings: [
    { parameterName: "releasedNodeNames", child: SkillNode, targetKeyProperty: "id", targetProperty: "released" },
  ],
}),
  ],
  actionTransforms: [ReleaseSkillNodeTransform, RestrainSkillNodeTransform],
});
