import { defineOverlayDomainType, definePackage, dependencyPackage, PT, UiCond } from "~/dsl";

import { jaEnField } from "../../../dsl/jaEnField";
import questSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import energySurface from "../../../foundation-economy-energy/dsl/dependency-surface.json";

const quest = dependencyPackage(questSurface);
const currency = dependencyPackage(currencySurface);
const energy = dependencyPackage(energySurface);

const QuestCollection = quest.type("QuestCollection");
const Progress = quest.type("Progress");

const WALLET_SLOT = 0;

/** Match the stamina row owned by the shared energy demo rather than authoring a second meter. */
const STAMINA = "stamina";

const MAIN = "main";

const QUESTS = [
  {
    id: "quest1",
    displayName: "Forest patrol",
    staminaCost: 10,
    reward: 10,
    firstClearReward: 100,
  },
  {
    id: "quest2",
    displayName: "Cave expedition",
    staminaCost: 20,
    reward: 30,
    firstClearReward: 200,
  },
  {
    id: "quest3",
    displayName: "Dragon hunt",
    staminaCost: 30,
    reward: 60,
    firstClearReward: 300,
  },
] as const;

function depositEntry(propertyName: string) {
  return {
    transformPackageId: currency.packageId,
    transformName: "DepositFreeCurrency",
    arguments: [
      { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
      { parameterName: "count", source: { kind: "domainProperty", propertyName } },
    ],
  } as const;
}

/** Use published ids for inherited action slots because this DSL evaluation does not resolve the dependency closure. The feature binds completion rewards under contents[0]. */
const Quest = defineOverlayDomainType(
  "Quest",
  {
    ...quest.overlay("Quest"),
    actionPropertyTransforms: [
      {
        targetProperty: quest.propertyId("Quest", "consumeActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: energy.packageId,
            transformName: "ConsumeEnergy",
            arguments: [
              { parameterName: "energy", source: { kind: "static", value: STAMINA } },
              {
                parameterName: "value",
                source: { kind: "domainProperty", propertyName: "staminaCost" },
              },
            ],
          },
        ],
      },
      {
        targetProperty: quest.propertyId("Quest", "completeAcquireActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [depositEntry("reward")],
      },
      {
        targetProperty: quest.propertyId("Quest", "firstCompleteAcquireActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [depositEntry("firstClearReward")],
      },
    ],
  },
  domainType =>
    domainType
      .property(PT.string("displayName").assetDelivery().required())
      .property(PT.int32("staminaCost").masterData().required())
      .property(PT.int32("reward").masterData().required())
      .property(PT.int32("firstClearReward").masterData().required())
      .localizedProperties({
        displayName: jaEnField(
          "表示名",
          "Display name",
          "クエスト一覧と進行中パネルに表示する名前です。",
          "Name shown in the quest list and the running panel."
        ),
        staminaCost: jaEnField(
          "消費スタミナ",
          "Stamina cost",
          "クエスト開始時に消費するスタミナです。",
          "Stamina spent when the quest starts.",
          { ja: "スタミナ", en: "stamina" }
        ),
        reward: jaEnField(
          "クリア報酬",
          "Clear reward",
          "クリアするたびに付与する無償通貨です。",
          "Free currency paid on every clear.",
          { ja: "通貨", en: "currency" }
        ),
        firstClearReward: jaEnField(
          "初回クリアボーナス",
          "First-clear bonus",
          "初回クリア時だけ追加で付与する無償通貨です。",
          "Free currency paid on top of the reward on the first clear only.",
          { ja: "通貨", en: "currency" }
        ),
      })
);

const withQuests = QUESTS.reduce(
  (builder, { id, displayName, staminaCost, reward, firstClearReward }) =>
    // Use the local overlay name for its added properties; initialize required action lists before appending costs and rewards. Failure has no payout.
    builder.instance("Quest", id, {
      [quest.propertyId("Quest", "collection")]: MAIN,
      [quest.propertyId("Quest", "consumeActions")]: [],
      [quest.propertyId("Quest", "completeAcquireActions")]: [],
      [quest.propertyId("Quest", "firstCompleteAcquireActions")]: [],
      [quest.propertyId("Quest", "failedAcquireActions")]: [],
      displayName,
      staminaCost,
      reward,
      firstClearReward,
    }),
  definePackage("micro-economy-quest-demo", "0.0.0")
    .display({
      label: { ja: "クエスト（デモデータ）", en: "Quests (demo data)" },
      description: {
        ja: "ライブデモ用のクエストグループと 3 つのクエスト、その消費スタミナ・クリア報酬・初回クリアボーナスを提供します。",
        en: "Supplies the live demo's quest group and three quests, with the stamina each costs, the reward each pays, and a first-clear bonus.",
      },
    })
    .displayType(Quest, {
      label: { ja: "クエスト", en: "Quest" },
      description: {
        ja: "デモのクエストに、表示名・消費スタミナ・クリア報酬・初回クリアボーナスを足します。",
        en: "Adds a display name, stamina cost, clear reward and first-clear bonus to a demo quest.",
      },
    })
    .dependency(quest.packageId, "github:gs2io/gs2-studio-package")
    .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
    // Reuse shared schedule content so this demo cannot remove event windows from that stack.
    .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
    // Reuse the shared energy and currency demo content so their stacks stay identical across deployments.
    .dependency(energy.packageId, "github:gs2io/gs2-studio-package")
    .dependency("foundation-economy-energy-demo", "github:gs2io/gs2-studio-package")
    .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
    .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
    .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

    .domainType(Quest)
    .instance(QuestCollection, MAIN, {})
);

export const microEconomyQuestDemo = withQuests
  .uiComponent(Quest, ui =>
    ui
      .templateLabel(
        "NameLabel",
        "{displayName}",
        { displayName: ui.prop("displayName") },
        { name: "Quest" }
      )
      .templateLabel(
        "BriefLabel",
        "Costs {staminaCost} stamina. Pays {reward} coins, plus {firstClearReward} on the first clear.",
        {
          staminaCost: ui.prop("staminaCost"),
          reward: ui.prop("reward"),
          firstClearReward: ui.prop("firstClearReward"),
        },
        { name: "Quest" }
      )
      .templateLabel(
        "RunningLabel",
        "Running: {displayName} ({staminaCost} stamina spent)",
        { displayName: ui.prop("displayName"), staminaCost: ui.prop("staminaCost") },
        { name: "Quest" }
      )
      .buttonAction("StartButton", "Start", undefined, { name: "Quest" })
      .templateLabel("ClearedLabel", "Cleared", {}, { name: "Quest" })
      // Negate completed because the toggle hides the cleared mark while its condition is true.
      .activeToggle("UnclearedActiveToggle", UiCond.not(UiCond.truthy(ui.prop("completed"))), {
        name: "Quest",
      })
  )

  .uiComponent(Progress, ui =>
    ui
      .buttonAction("CompleteButton", "Complete", undefined, { name: "Progress" })
      .templateLabel("IdleLabel", "No quest in progress", {}, { name: "Progress" })
      // Hide Complete without an active run and the idle label while one exists.
      .activeToggle("IdleActiveToggle", UiCond.not(UiCond.truthy(ui.prop("inProgress"))), {
        name: "Progress",
      })
      .activeToggle("RunningActiveToggle", UiCond.truthy(ui.prop("inProgress")), {
        name: "Progress",
      })
  )
  .build();
