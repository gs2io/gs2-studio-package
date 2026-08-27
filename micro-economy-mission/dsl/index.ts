import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** The schedule type this package points its mission groups at. */
const SCHEDULE_EVENT_TYPE_ID = "dt_55N8HND2SNZV1ZMCJS4NA2BTFD";

/** Package-wide reset timing; one row per project. */
const MissionSetting = defineDomainType("MissionSetting", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(
      PT.prop(
        "resetDayOfWeek",
        PT.enum("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
      )
        .masterData()
        .required()
    )
    .property(PT.int32("resetDayOfMonth").masterData().required())
    .property(PT.int32("resetHour").masterData().required())
);

/** A counter a mission can watch, tracked per reset window. */
const MissionCounter = defineDomainType("MissionCounter", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int64("todayValue").userData().required())
    .property(PT.int64("weeklyValue").userData().required())
    .property(PT.int64("monthlyValue").userData().required())
    .property(PT.int64("totalValue").userData().required())
);

/** A group of missions sharing one reset cadence. */
const MissionCollection = defineDomainType("MissionCollection", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID)).assetDelivery())
    .property(
      PT.prop("scope", PT.enum("daily", "weekly", "monthly", "notReset"))
        .masterData()
        .required()
    )
);

const Mission = defineDomainType("Mission", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("missionCollection", PT.ref("MissionCollection")).masterData().required())
    .property(
      PT.prop("completeAcquireActions", PT.listOf(PT.acquireAction())).masterData().required()
    )
    .property(PT.prop("counter", PT.ref("MissionCounter")).masterData().required())
    .property(PT.int64("targetValue").masterData().required())
    .property(PT.bool("completed").userData().required())
    .property(PT.bool("received").userData().required())
);

const CounterModel = defineMasterDataResource(resource => {
  const model = resource
    .model(GS2.mission.CounterModel)
    .mountLocal(MissionCounter)
    .bindings({
      name: Bind.domainProperty(Source.direct(MissionCounter, "id")),
      challengePeriodEventId: Bind.null(),
    });
  model.addArrayChild("scopes", scope => {
    scope
      .model(GS2.mission.CounterScopeModel)
      .mountLocal(MissionCounter)
      .bindings({
        scopeType: Bind.static("resetTiming"),
        resetType: Bind.static("daily"),
        resetHour: Bind.domainProperty(
          Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
        ),
      });
  });
  model.addArrayChild("scopes", scope => {
    scope
      .model(GS2.mission.CounterScopeModel)
      .mountLocal(MissionCounter)
      .bindings({
        scopeType: Bind.static("resetTiming"),
        resetType: Bind.static("weekly"),
        resetDayOfWeek: Bind.domainProperty(
          Source.parent(Source.parent(Source.direct(MissionSetting, "resetDayOfWeek")))
        ),
        resetHour: Bind.domainProperty(
          Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
        ),
      });
  });
  model.addArrayChild("scopes", scope => {
    scope
      .model(GS2.mission.CounterScopeModel)
      .mountLocal(MissionCounter)
      .bindings({
        scopeType: Bind.static("resetTiming"),
        resetType: Bind.static("monthly"),
        resetDayOfMonth: Bind.domainProperty(
          Source.parent(Source.parent(Source.direct(MissionSetting, "resetDayOfMonth")))
        ),
        resetHour: Bind.domainProperty(
          Source.parent(Source.parent(Source.direct(MissionSetting, "resetHour")))
        ),
      });
  });
  model.addArrayChild("scopes", scope => {
    scope
      .model(GS2.mission.CounterScopeModel)
      .mountLocal(MissionCounter)
      .bindings({
        scopeType: Bind.static("resetTiming"),
        resetType: Bind.static("notReset"),
      });
  });
  return model;
});

const MissionTaskModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.mission.MissionTaskModel)
    .mountLocal(Mission)
    .bindings({
      name: Bind.domainProperty(Source.direct(Mission, "id")),
      challengePeriodEventId: Bind.null(),
      verifyCompleteType: Bind.static("counter"),
      targetCounter: {
        conditionName: Bind.static(""),
        counterName: Bind.domainProperty(
          Source.idRef(
            "Mission",
            [{ refPropertyName: "counter", targetTypeName: "MissionCounter" }],
            "id"
          )
        ),
        resetType: Bind.static("notReset"),
        scopeType: Bind.null(),
        value: Bind.domainProperty(Source.direct(Mission, "targetValue")),
      },
    })
    .addArrayChild("completeAcquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Mission)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(Mission, "completeAcquireActions"))
          ),
        });
    })
);

const MissionGroupModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.mission.MissionGroupModel)
    .mountLocal(MissionCollection)
    .bindings({
      name: Bind.domainProperty(Source.direct(MissionCollection, "id")),
      completeNotificationNamespaceId: Bind.null(),
      resetType: Bind.domainProperty(Source.direct(MissionCollection, "scope")),
      resetDayOfMonth: Bind.domainProperty(
        Source.parent(Source.direct(MissionSetting, "resetDayOfMonth"))
      ),
      resetDayOfWeek: Bind.domainProperty(
        Source.parent(Source.direct(MissionSetting, "resetDayOfWeek"))
      ),
      resetHour: Bind.domainProperty(Source.parent(Source.direct(MissionSetting, "resetHour"))),
    })
    .addArrayChild("tasks", MissionTaskModel)
);

export const microEconomyMission = definePackage("micro-economy-mission", "0.0.0")
  .display({
    label: { ja: "ミッション", en: "Missions" },
    description: {
      ja: "日次・週次などのミッションと、その達成条件・報酬を管理します。",
      en: "Manages daily and weekly missions along with their conditions and rewards.",
    },
  })
  .displayType(MissionCollection, { label: { ja: "ミッショングループ", en: "Mission group" } })
  .displayType(MissionCounter, { label: { ja: "ミッションカウンター", en: "Mission counter" } })
  .displayType(MissionSetting, { label: { ja: "ミッション設定", en: "Mission setting" } })
  .displayType(Mission, { label: { ja: "ミッション", en: "Mission" } })
  .dependency(
    "foundation-economy-schedule",
    "file:../../../foundation-economy-schedule/packages/foundation-economy-schedule"
  )
  .domainType(MissionCollection)
  .domainType(MissionCounter)
  .domainType(MissionSetting)
  .domainType(Mission)

  .uiComponent(Mission, ui =>
    ui
      .activeToggle("CompletedActiveToggle", UiCond.truthy(ui.prop("completed")), {
        name: "Mission",
      })
      .activeToggle("ReceivedActiveToggle", UiCond.truthy(ui.prop("received")), { name: "Mission" })
  )
  .uiComponent(MissionCounter, ui =>
    ui
      .label("TodayValueLabel", ui.prop("todayValue"), { name: "MissionCounter" })
      .label("WeeklyValueLabel", ui.prop("weeklyValue"), { name: "MissionCounter" })
      .label("MonthlyValueLabel", ui.prop("monthlyValue"), { name: "MissionCounter" })
      .label("TotalValueLabel", ui.prop("totalValue"), { name: "MissionCounter" })
  )

  .masterDataResource(r =>
    r
      .model(GS2.mission.Namespace)
      .mountLocal(MissionSetting)
      .bindings({
        name: Bind.static("Mission"),
        counterIncrementScript: Bind.null(),
        missionCompleteScript: Bind.null(),
        receiveRewardsScript: Bind.null(),
        logSetting: Bind.null(),
        completeNotification: {
          enable: Bind.static("Enabled"),
          enableTransferMobileNotification: Bind.static(false),
          gatewayNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:gateway:default"),
          sound: Bind.static(""),
        },
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
      .addChild(CounterModel)
      .addChild(MissionGroupModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.mission.Complete)
      .mountLocal(MissionCollection)
      .linkedMasterResourceId(MissionGroupModel)
      .bindings({
        completeId: Bind.skip(),
        missionGroupName: Bind.skip(),
        userId: Bind.skip(),
      })
      .arrayMembershipMapping("completedMissionTaskNames", Mission, "id", "completed")
      .arrayMembershipMapping("receivedMissionTaskNames", Mission, "id", "received")
  )

  .userDataResource(r =>
    r
      .model(GS2.mission.Counter)
      .linkedMasterResourceId(CounterModel)
      .bindings({
        counterId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      })
      .elementProjectionBinding("values", MissionCounter, [
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "daily" },
          ],
          projections: [{ fieldName: "value", targetPropertyName: "todayValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "weekly" },
          ],
          projections: [{ fieldName: "value", targetPropertyName: "weeklyValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "monthly" },
          ],
          projections: [{ fieldName: "value", targetPropertyName: "monthlyValue" }],
        },
        {
          selectors: [
            { fieldName: "scopeType", value: "resetTiming" },
            { fieldName: "resetType", value: "notReset" },
          ],
          projections: [{ fieldName: "value", targetPropertyName: "totalValue" }],
        },
      ])
  )

  .actionTransform("IncreaseMissionCounter", at =>
    at
      .category("acquire")
      .parameter("counter", { type: PT.ref("MissionCounter") })
      .parameter("value", { type: PT.int32() })
      .output("Gs2Mission:IncreaseCounterByUserId", o =>
        o
          .resourceRef(() => CounterModel)
          .mapMountedResourceProperty("namespaceName", () => CounterModel)
          .mapParameter("counterName", "counter")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("value", "value")
      )
  )

  .delegatedAction(MissionCollection, "Receive", {
    targetActionKey: "Gs2Mission:MissionGroupModel.BatchComplete",
    targetResource: MissionGroupModel,
    parameterOverrides: [],
  })
  .delegatedAction(Mission, "Receive", {
    targetActionKey: "Gs2Mission:MissionTaskModel.Complete",
    targetResource: MissionTaskModel,
    parameterOverrides: [],
  })
  .build();
