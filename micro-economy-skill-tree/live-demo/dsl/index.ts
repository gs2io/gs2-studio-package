import {
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { jaEnField } from "../../../dsl/jaEnField";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

import skillTreeSurface from "../../dsl/dependency-surface.json";

const skillTree = dependencyPackage(skillTreeSurface);

const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

const RETURN_RATE = 0.5;

const RELEASE_CONSUME_ACTIONS = skillTree.propertyId("SkillNode", "releaseConsumeActions");

const PREMISE_NODES = skillTree.propertyId("SkillNode", "premiseNodes");

const RESTRAIN_RETURN_RATE = skillTree.propertyId("SkillNode", "restrainReturnRate");

const RELEASED = skillTree.propertyId("SkillNode", "released");

const SkillNode = defineOverlayDomainType("SkillNode", skillTree.overlay("SkillNode"), {
  properties: {
    cost: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: RELEASE_CONSUME_ACTIONS, mode: "append", transformPackageId: currency.packageId, transformId: currency.transformId("WithdrawCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          // Allow the free balance funded by the page deposit instead of requiring paid currency.
          { parameterName: "paidOnly", source: { kind: "static", value: false } },
          {
            parameterName: "count",
            source: { kind: "domainProperty", propertyName: "cost" },
          },
        ] },
  ],
  localizedDisplay: {
    ja: {
      label: "スキルノード",
      description: "デモのスキルノードに、解放時へ消費するコインの額を足します。",
    },
    en: {
      label: "Skill node",
      description: "Adds the coins a demo skill node charges when it is released.",
    },
  },
  localizedProperties: {
      cost: jaEnField(
        "解放コスト",
        "Unlock cost",
        "このノードを解放するときに消費するコインの額です。",
        "Coins spent to unlock this node."
      ),
    },
});

const NODES = [
  { id: "first", premises: [] as readonly string[], cost: 10 },
  { id: "left", premises: ["first"], cost: 20 },
  { id: "right", premises: ["first"], cost: 20 },
  { id: "last", premises: ["left", "right"], cost: 50 },
] as const;

export const microEconomySkillTreeDemo = definePackage({
  id: "micro-economy-skill-tree-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "スキルツリー（デモデータ）",
      description:
        "ライブデモ用の 4 つのスキルノードと、その解放コストを支払うコインを提供します。ノードの解放状況はキャラクターごとに記録されます。",
    },
    en: {
      label: "Skill Tree (demo data)",
      description:
        "Supplies the live demo's four skill nodes and the coins their unlock costs are paid from. What is unlocked is tracked per character.",
    },
  },
  dependencies: {
    [skillTree.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
    "foundation-economy-character-demo": "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [SkillNode],
  instances: [
    ...NODES.map(({ id, premises, cost }) => instance(SkillNode, id, {
      // Keep the required action list empty before the overlay appends its cost.
      [RELEASE_CONSUME_ACTIONS]: [],
      [PREMISE_NODES]: [...premises],
      [RESTRAIN_RETURN_RATE]: RETURN_RATE,
      cost,
    })),
  ],
  uiComponents: [
    defineUiComponent(SkillNode, {
  items: [
    UiItem.activeToggle("ReleasedActiveToggle", UiCond.truthy(UiSource.inheritedProp(RELEASED)), {
        name: "SkillNode",
      }),
    UiItem.activeToggle("UnreleasedActiveToggle", UiCond.not(UiCond.truthy(UiSource.inheritedProp(RELEASED))), { name: "SkillNode" }),
  ],
}),
  ],
});
