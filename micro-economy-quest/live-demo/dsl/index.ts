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
import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import questSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

import energySurface from "../../../foundation-economy-energy/dsl/dependency-surface.json";

const quest = dependencyPackage(questSurface);

const currency = dependencyPackage(currencySurface);

const energy = dependencyPackage(energySurface);

const QuestCollection = quest.type("QuestCollection");

const Progress = quest.type("Progress");

const WALLET_SLOT = 0;

const STAMINA = "stamina";

const MAIN = "main";

// ProgressHandler holds the player's single progress row under this id.
const PROGRESS_ROW = "progress";

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

function depositEntry<TName extends string>(propertyName: TName) {
  return {
    transformPackageId: currency.packageId,
    transformId: currency.transformId("DepositFreeCurrency"),
    arguments: [
      { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
      { parameterName: "count", source: { kind: "domainProperty", propertyName } },
    ],
  } as const;
}

const Quest = defineOverlayDomainType("Quest", quest.overlay("Quest"), {
  properties: {
    displayName: PT.string().assetDelivery().required(),
    staminaCost: PT.int32().masterData().required(),
    reward: PT.int32().masterData().required(),
    firstClearReward: PT.int32().masterData().required(),
  },
  actionPropertyTransforms: [
    { targetProperty: quest.propertyId("Quest", "consumeActions"), mode: "append", transformPackageId: energy.packageId, transformId: energy.transformId("ConsumeEnergy"), arguments: [
          { parameterName: "energy", source: { kind: "static", value: STAMINA } },
          {
            parameterName: "value",
            source: { kind: "domainProperty", propertyName: "staminaCost" },
          },
        ] },
    { targetProperty: quest.propertyId("Quest", "completeAcquireActions"), mode: "append", ...depositEntry("reward") },
    { targetProperty: quest.propertyId("Quest", "firstCompleteAcquireActions"), mode: "append", ...depositEntry("firstClearReward") },
  ],
  localizedDisplay: {
    ja: {
      label: "クエスト",
      description:
        "デモのクエストに、表示名・消費スタミナ・クリア報酬・初回クリアボーナスを足します。",
    },
    en: {
      label: "Quest",
      description:
        "Adds a display name, stamina cost, clear reward and first-clear bonus to a demo quest.",
    },
  },
  localizedProperties: {
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
      },
});

export const microEconomyQuestDemo = definePackage({
  id: "micro-economy-quest-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "クエスト（デモデータ）",
      description:
        "ライブデモ用のクエストグループと 3 つのクエスト、その消費スタミナ・クリア報酬・初回クリアボーナスを提供します。",
    },
    en: {
      label: "Quests (demo data)",
      description:
        "Supplies the live demo's quest group and three quests, with the stamina each costs, the reward each pays, and a first-clear bonus.",
    },
  },
  dependencies: liveDemoDependencies(
    quest.packageId,
    "foundation-economy-schedule",
    "foundation-economy-schedule-demo",
    energy.packageId,
    "foundation-economy-energy-demo",
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  domainTypes: [Quest],
  instances: [
    instance(QuestCollection, MAIN, {}),
    ...QUESTS.map(({ id, displayName, staminaCost, reward, firstClearReward }) =>
      instance(Quest, id, {
        [quest.propertyId("Quest", "collection")]: MAIN,
        [quest.propertyId("Quest", "consumeActions")]: [],
        [quest.propertyId("Quest", "completeAcquireActions")]: [],
        [quest.propertyId("Quest", "firstCompleteAcquireActions")]: [],
        [quest.propertyId("Quest", "failedAcquireActions")]: [],
        displayName,
        staminaCost,
        reward,
        firstClearReward,
      })
    ),
  ],
  uiComponents: [
    defineUiComponent(Quest, {
      items: [
        UiItem.templateLabel(
          "NameLabel",
          "{displayName}",
          { displayName: UiSource.prop("displayName") },
          { name: "Quest" }
        ),
        UiItem.templateLabel(
          "BriefLabel",
          "Costs {staminaCost} stamina. Pays {reward} coins, plus {firstClearReward} on the first clear.",
          {
            staminaCost: UiSource.prop("staminaCost"),
            reward: UiSource.prop("reward"),
            firstClearReward: UiSource.prop("firstClearReward"),
          },
          { name: "Quest" }
        ),
        UiItem.templateLabel(
          "RunningLabel",
          "Running: {displayName} ({staminaCost} stamina spent)",
          { displayName: UiSource.prop("displayName"), staminaCost: UiSource.prop("staminaCost") },
          { name: "Quest" }
        ),
        // micro-economy-quest ships QuestStartButton. It is usable only while the player's stamina covers the
        // cost and no quest is in progress (GS2 refuses Start with alreadyExists then); the page reads the
        // stamina row and the progress row from the Energy and Progress handlers that sit above the quest rows.
        // The page builder wires a section's toggles to that section's rows only, so the quest list cannot be
        // gated by ProgressIdleActiveToggle from the progress section; one condition here gates the same button.
        UiItem.interactable(
          "StartInteractable",
          UiCond.and(
            UiCond.gte(
              UiSource.rowProp(energy.type("Energy"), STAMINA, "currentValue"),
              UiSource.prop("staminaCost")
            ),
            UiCond.not(UiCond.truthy(UiSource.rowProp(Progress, PROGRESS_ROW, "inProgress")))
          ),
          { name: "Quest" }
        ),
        UiItem.templateLabel("ClearedLabel", "Cleared", {}, { name: "Quest" }),
        UiItem.activeToggle(
          "UnclearedActiveToggle",
          UiCond.not(UiCond.truthy(UiSource.prop("completed"))),
          { name: "Quest" }
        ),
      ],
    }),
    // micro-economy-quest ships Progress's CompleteButton and its idle and running toggles; the demo adds only its
    // English caption for the idle state.
    defineUiComponent(Progress, {
      items: [
        UiItem.templateLabel("IdleLabel", "No quest in progress", {}, { name: "Progress" }),
      ],
    }),
  ],
});
