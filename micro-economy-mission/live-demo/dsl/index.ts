import {
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import missionSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const mission = dependencyPackage(missionSurface);
const currency = dependencyPackage(currencySurface);

const MissionSetting = mission.type("MissionSetting");

const MissionCounter = mission.type("MissionCounter");

const MissionCollection = mission.type("MissionCollection");

const WALLET_SLOT = 0;

/** Append the currency reward without replacing other authored actions; bind its amount so the generated reader recovers the deployed reward. */
const Mission = defineOverlayDomainType(
  "Mission",
  {
    ...mission.overlay("Mission"),
    actionPropertyTransforms: [
      {
        // Use the published property id because this DSL evaluation does not resolve the dependency closure.
        targetProperty: mission.propertyId("Mission", "completeAcquireActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "DepositFreeCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              {
                parameterName: "count",
                source: { kind: "domainProperty", propertyName: "rewardAmount" },
              },
            ],
          },
        ],
      },
    ],
  },
  domainType =>
    domainType.property(
      PT.int32("rewardAmount")
        .masterData()
        .required()
        .description("Coins this mission pays when its reward is received")
    )
);

const COUNTER_ID = mission.propertyId("MissionCounter", "id");

const COUNTER = "counter";

const STEP = 1;

const CAREER = "career";
const DAILY = "daily";

const RESET_HOUR = 0;
const RESET_DAY_OF_WEEK = "monday";
const RESET_DAY_OF_MONTH = 1;

/** Vary targets and rewards so the page demonstrates separate completion thresholds and row-specific payouts. */
const MISSIONS = [
  { id: "career1", group: CAREER, target: 1, reward: 10 },
  { id: "career3", group: CAREER, target: 3, reward: 30 },
  { id: "career5", group: CAREER, target: 5, reward: 50 },
  { id: "daily2", group: DAILY, target: 2, reward: 20 },
] as const;

const AdvanceRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(MissionCounter)
    .bindings({ name: Bind.domainProperty(Source.direct(MissionCounter, COUNTER_ID)) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(MissionCounter)
        .bindings({
          action: Bind.transform(mission.packageId, "IncreaseMissionCounter", [
            // Bind the counter identity so each authored counter gets its own rate without duplicating this definition.
            Arg.domainProperty("counter", Source.direct(MissionCounter, COUNTER_ID)),
            Arg.static("value", STEP),
          ]),
        });
    })
);

const withGroups = definePackage("micro-economy-mission-demo", "0.0.0")
  .display({
    label: { ja: "ミッション（デモデータ）", en: "Missions (demo data)" },
    description: {
      ja: "ライブデモ用のリセット設定、1 つのカウンター、それを見る 4 つのミッションと 2 つのグループ、カウンターを進める操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's reset settings, the one counter it shows, the four missions that read it, the two groups they belong to, and the press that advances the counter. The rewards land in the currency package's wallet.",
    },
  })
  .displayType(Mission, {
    label: { ja: "ミッション", en: "Mission" },
    description: {
      ja: "デモのミッションに、報酬の受け取り時に付与するコインの額を足します。",
      en: "Adds the coins a demo mission pays when its reward is received.",
    },
  })
  .dependency(mission.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // Reuse the shared schedule content so this demo cannot remove event windows from that stack.
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so wallet and store products stay identical across demos.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(Mission)

  .instance(MissionSetting, "missionsetting", {
    [mission.propertyId("MissionSetting", "resetHour")]: RESET_HOUR,
    [mission.propertyId("MissionSetting", "resetDayOfWeek")]: RESET_DAY_OF_WEEK,
    [mission.propertyId("MissionSetting", "resetDayOfMonth")]: RESET_DAY_OF_MONTH,
  })

  // Author the empty counter row because its identity supplies the deployed model and the page controls.
  .instance(MissionCounter, COUNTER, {})

  .instance(MissionCollection, CAREER, {
    [mission.propertyId("MissionCollection", "scope")]: "notReset",
  })

  .instance(MissionCollection, DAILY, {
    [mission.propertyId("MissionCollection", "scope")]: "daily",
  });

// Use the local type name so authored rows can include rewardAmount, which is absent from the dependency surface.
const withMissions = MISSIONS.reduce(
  (builder, { id, group, target, reward }) =>
    builder.instance("Mission", id, {
      [mission.propertyId("Mission", "missionCollection")]: group,
      [mission.propertyId("Mission", "counter")]: COUNTER,
      [mission.propertyId("Mission", "targetValue")]: target,
      // Keep the required action list empty before the overlay appends its reward.
      [mission.propertyId("Mission", "completeAcquireActions")]: [],
      rewardAmount: reward,
    }),
  withGroups
);

export const microEconomyMissionDemo = withMissions
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("MissionAdvance"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the counter change without a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(AdvanceRateModel)
  )

  .uiComponent(MissionCounter, ui =>
    ui.buttonAction("AdvanceButton", "Advance", undefined, { name: "MissionCounter" })
  )

  .uiComponent(Mission, ui =>
    ui
      // Read target and reward from the bound row so the page reflects the deployed task.
      .templateLabel(
        "BriefLabel",
        "Wants {target} on the counter. Pays {reward} coins.",
        { target: ui.prop("targetValue"), reward: ui.prop("rewardAmount") },
        { name: "Mission" }
      )
      .buttonAction("ReceiveButton", "Receive", undefined, { name: "Mission" })
      .templateLabel(
        "ReceivedLabel",
        "Received {reward} coins.",
        { reward: ui.prop("rewardAmount") },
        { name: "Mission" }
      )
      // Hide the claim button until completion and after receipt; a single combined toggle owns its active state.
      .activeToggle(
        "ReceiveUnavailableActiveToggle",
        UiCond.or(
          UiCond.not(UiCond.truthy(ui.prop("completed"))),
          UiCond.truthy(ui.prop("received"))
        ),
        { name: "Mission" }
      )
      // Negate received because page toggle bindings hide their target rows while true.
      .activeToggle("NotReceivedActiveToggle", UiCond.not(UiCond.truthy(ui.prop("received"))), {
        name: "Mission",
      })
  )

  .delegatedAction(MissionCounter, "Advance", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: AdvanceRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
