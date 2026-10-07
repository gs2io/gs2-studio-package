import { defineOverlayDomainType, definePackage, dependencyPackage, PT, UiCond } from "~/dsl";

import { jaEnField } from "../../../dsl/jaEnField";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import skillTreeSurface from "../../dsl/dependency-surface.json";

const skillTree = dependencyPackage(skillTreeSurface);
const currency = dependencyPackage(currencySurface);

const WALLET_SLOT = 0;

const RETURN_RATE = 0.5;

/** Use published property ids for inherited slots; the local overlay only declares cost. */
const RELEASE_CONSUME_ACTIONS = skillTree.propertyId("SkillNode", "releaseConsumeActions");
const PREMISE_NODES = skillTree.propertyId("SkillNode", "premiseNodes");
const RESTRAIN_RETURN_RATE = skillTree.propertyId("SkillNode", "restrainReturnRate");
const RELEASED = skillTree.propertyId("SkillNode", "released");

/** Append the currency cost without replacing other authored actions; bind its amount so the generated reader recovers the deployed charge. */
const SkillNode = defineOverlayDomainType(
  "SkillNode",
  {
    ...skillTree.overlay("SkillNode"),
    actionPropertyTransforms: [
      {
        targetProperty: RELEASE_CONSUME_ACTIONS,
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "WithdrawCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              // Allow the free balance funded by the page deposit instead of requiring paid currency.
              { parameterName: "paidOnly", source: { kind: "static", value: false } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "cost" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType
      .property(
        PT.int32("cost")
          .masterData()
          .required()
          .description("Coins this node charges when it is released")
      )
      .localizedProperties({
        cost: jaEnField(
          "解放コスト",
          "Unlock cost",
          "このノードを解放するときに消費するコインの額です。",
          "Coins spent to unlock this node."
        ),
      })
);

/** Require both branches at the final node so the demo exercises a join rather than only a prerequisite chain. */
const NODES = [
  { id: "first", premises: [] as readonly string[], cost: 10 },
  { id: "left", premises: ["first"], cost: 20 },
  { id: "right", premises: ["first"], cost: 20 },
  { id: "last", premises: ["left", "right"], cost: 50 },
] as const;

const withDependencies = definePackage("micro-economy-skill-tree-demo", "0.0.0")
  .display({
    label: { ja: "スキルツリー（デモデータ）", en: "Skill Tree (demo data)" },
    description: {
      ja: "ライブデモ用の 4 つのスキルノードと、その解放コストを支払うコインを提供します。ノードの解放状況はキャラクターごとに記録されます。",
      en: "Supplies the live demo's four skill nodes and the coins their unlock costs are paid from. What is unlocked is tracked per character.",
    },
  })
  .displayType(SkillNode, {
    label: { ja: "スキルノード", en: "Skill node" },
    description: {
      ja: "デモのスキルノードに、解放時へ消費するコインの額を足します。",
      en: "Adds the coins a demo skill node charges when it is released.",
    },
  })
  .dependency(skillTree.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  // Reuse the shared roster and recruitment so new visitors can obtain the character that owns their tree.
  .dependency("foundation-economy-character-demo", "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so wallet and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(SkillNode);

// Use the local type name so authored rows can include cost, which is absent from the dependency surface.
const withNodes = NODES.reduce(
  (builder, { id, premises, cost }) =>
    builder.instance("SkillNode", id, {
      // Keep the required action list empty before the overlay appends its cost.
      [RELEASE_CONSUME_ACTIONS]: [],
      [PREMISE_NODES]: [...premises],
      [RESTRAIN_RETURN_RATE]: RETURN_RATE,
      cost,
    }),
  withDependencies
);

export const microEconomySkillTreeDemo = withNodes
  .uiComponent(SkillNode, ui =>
    ui
      .activeToggle("ReleasedActiveToggle", UiCond.truthy(ui.inheritedProp(RELEASED)), {
        name: "SkillNode",
      })
      .activeToggle(
        "UnreleasedActiveToggle",
        UiCond.not(UiCond.truthy(ui.inheritedProp(RELEASED))),
        { name: "SkillNode" }
      )
  )
  .build();
