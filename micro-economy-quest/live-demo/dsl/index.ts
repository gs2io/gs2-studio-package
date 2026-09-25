/**
 * Live demo content for `micro-economy-quest`.
 *
 * The feature package is the quest table and the run a player has open; it
 * ships no quests, and what a quest costs and pays is a title's decision. This
 * package supplies one group of three quests, what each one costs in stamina
 * and pays in free currency, and a bonus the first clear pays on top.
 *
 * A visitor picks a quest, presses Start, and watches stamina drop and a
 * "running" panel appear naming the quest. Complete pays the reward into the
 * wallet, clears the panel, and marks the quest cleared — and the first clear
 * of each quest pays its bonus as well, which a second clear visibly does not.
 *
 * **Both presses are the feature package's.** `Start` and `Complete` are
 * GS2-Quest's own client actions, declared on `Quest` and `Progress` by the
 * feature package; the demo only puts the buttons on the page. They cannot be
 * exchanges: GS2 has no server-side action that ends a quest, and a started
 * progress created through an exchange would skip the quest's own start cost.
 *
 * **One run at a time.** GS2 keeps a single progress per player, and `Start`
 * is pinned to `force: false` so a run left open is kept — it stays in the
 * progress panel until Complete closes it — rather than silently discarded. Pressing Start while a quest is running is therefore
 * refused (`alreadyExists`); the page says so in the quest list's caption,
 * because a quest row cannot read the progress to hide its own button.
 *
 * **What a quest costs and pays is appended, not authored.** The feature
 * package leaves `consumeActions`, `completeAcquireActions` and
 * `firstCompleteAcquireActions` open; this demo overlays `Quest` to append a
 * stamina withdrawal and two free-currency deposits sized from properties the
 * overlay declares, so three quests cost and pay three different amounts from
 * three written-out actions.
 *
 * The stamina meter, the wallet and the schedule are other packages' and are
 * installed beside this one rather than written out again: their rows live in
 * stacks every demo holding them deploys, and a second author of them would be
 * a second version, and the last deploy would win.
 */

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

/** The wallet the page shows and every reward lands in. */
const WALLET_SLOT = 0;

/**
 * The stamina row every start draws from. `foundation-economy-energy-demo`
 * authors it under this id (with a maximum of 50), so it is spelled here
 * rather than derived.
 */
const STAMINA = "stamina";

/** The one quest group. It has no schedule, so its quests are always open. */
const MAIN = "main";

/**
 * The quests, cheapest first. The costs fit the stamina maximum of 50, so the
 * first two can be run back to back and the third needs 30 of it; the
 * rewards and bonuses climb with the cost. The stamina section carries the
 * energy demo's Recover button so a visitor can run a quest twice (the
 * second clear pays no first-clear bonus) without waiting for regeneration.
 */
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

/** One free-currency deposit into the page's wallet, sized from `propertyName`. */
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

/**
 * The quest, overlaid so it can carry its name, what it costs and what it
 * pays. Each amount is appended to the slot the feature package leaves open;
 * the target properties are addressed by id because they belong to the type
 * this overlay extends, which a single-package build does not load.
 *
 * `completeAcquireActions` is read through the quest's `contents` entry, which
 * the feature package binds without a mount of its own, so the deposit lands
 * in `contents[0].completeAcquireActions` of the deployed quest model.
 */
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
    // Authored by type name so the row reaches the overlay this package
    // declares, and its properties with it. The list slots are authored empty
    // because the feature package requires them and the costs and rewards are
    // appended; a quest here has no failure payout.
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
    // The quest package points its groups at a schedule type, and an install
    // does not walk a package's own dependencies, so that package is named too.
    .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
    // Its event windows live in the schedule stack this demo deploys too;
    // deployed from here without them, that stack would lose them.
    .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
    // What a start costs: the stamina meter and its row.
    .dependency(energy.packageId, "github:gs2io/gs2-studio-package")
    .dependency("foundation-economy-energy-demo", "github:gs2io/gs2-studio-package")
    // Where a clear pays: the wallet, and the rows its stack holds.
    .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
    .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
    // The currency demo stocks the currency shop's price table, and an install
    // does not walk a package's own dependencies, so the shop is named too.
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
        "Costs {staminaCost} stamina. Pays {reward}, plus {firstClearReward} on the first clear.",
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
      // `Start` is the feature package's own press.
      .buttonAction("StartButton", "Start", undefined, { name: "Quest" })
      .templateLabel("ClearedLabel", "Cleared", {}, { name: "Quest" })
      // An active toggle carries the rows its condition empties: the cleared
      // mark has nothing to say until the quest has been cleared once.
      .activeToggle("UnclearedActiveToggle", UiCond.not(UiCond.truthy(ui.prop("completed"))), {
        name: "Quest",
      })
  )

  .uiComponent(Progress, ui =>
    ui
      // `Complete` is the feature package's own press; it pays the rewards the
      // run drew when it started.
      .buttonAction("CompleteButton", "Complete", undefined, { name: "Progress" })
      .templateLabel("IdleLabel", "No quest in progress", {}, { name: "Progress" })
      // Complete has nothing to finish while no quest is running, and the
      // idle sentence is wrong while one is.
      .activeToggle("IdleActiveToggle", UiCond.not(UiCond.truthy(ui.prop("inProgress"))), {
        name: "Progress",
      })
      .activeToggle("RunningActiveToggle", UiCond.truthy(ui.prop("inProgress")), {
        name: "Progress",
      })
  )
  .build();
