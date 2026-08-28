import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Energy = defineDomainType("Energy", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("defaultMaximum").masterData().required())
    .property(PT.bool("useOverflow").masterData().required())
    .property(PT.int32("overflowedMaximum").masterData().required())
    .property(PT.int32("recoveryIntervalMinutes").masterData().required())
    .property(PT.int32("recoveryValue").masterData().required())
    .property(PT.int32("currentValue").userData().required())
    .property(PT.int32("currentMaximumValue").userData().required())
    .property(PT.timestamp("nextRecoverdAt").userData().required())
    .localizedProperties({
      id: jaEnId("スタミナ", "stamina model"),
      defaultMaximum: jaEnField(
        "初期上限",
        "Initial maximum",
        "プレイヤーが最初に持つスタミナ上限です。",
        "Initial stamina capacity available to a player.",
        { ja: "ポイント", en: "points" }
      ),
      useOverflow: jaEnField(
        "上限超過を許可",
        "Allow overflow",
        "回復時にスタミナ上限を超えて保持できるかを設定します。",
        "Whether recovered stamina may exceed the normal capacity."
      ),
      overflowedMaximum: jaEnField(
        "超過時上限",
        "Overflow maximum",
        "上限超過を許可した場合に保持できる最大値です。",
        "Maximum stamina retained when overflow is allowed.",
        { ja: "ポイント", en: "points" }
      ),
      recoveryIntervalMinutes: jaEnField(
        "回復間隔",
        "Recovery interval",
        "スタミナを自動回復する間隔です。",
        "Interval between automatic stamina recoveries.",
        { ja: "分", en: "minutes" }
      ),
      recoveryValue: jaEnField(
        "1回の回復量",
        "Recovery amount",
        "回復間隔ごとに加算するスタミナ量です。",
        "Amount of stamina restored at each recovery interval.",
        { ja: "ポイント", en: "points" }
      ),
      currentValue: jaEnField(
        "現在値",
        "Current value",
        "プレイヤーが現在持っているスタミナです。",
        "Current stamina held by the player.",
        { ja: "ポイント", en: "points" }
      ),
      currentMaximumValue: jaEnField(
        "現在の上限",
        "Current maximum",
        "プレイヤーに適用されている現在のスタミナ上限です。",
        "Current stamina capacity applied to the player.",
        { ja: "ポイント", en: "points" }
      ),
      nextRecoverdAt: jaEnField(
        "次回回復日時",
        "Next recovery time",
        "次にスタミナが自動回復する日時です。",
        "Time of the next automatic stamina recovery."
      ),
    })
);

const StaminaModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.stamina.StaminaModel)
    .mountLocal(Energy)
    .bindings({
      name: Bind.domainProperty(Source.direct(Energy, "id")),
      initialCapacity: Bind.domainProperty(Source.direct(Energy, "defaultMaximum")),
      isOverflow: Bind.domainProperty(Source.direct(Energy, "useOverflow")),
      maxCapacity: Bind.domainProperty(Source.direct(Energy, "overflowedMaximum")),
      recoverIntervalMinutes: Bind.domainProperty(Source.direct(Energy, "recoveryIntervalMinutes")),
      recoverValue: Bind.domainProperty(Source.direct(Energy, "recoveryValue")),
      maxStaminaTable: Bind.null(),
      recoverIntervalTable: Bind.null(),
      recoverValueTable: Bind.null(),
    })
);

export const foundationEconomyEnergy = definePackage("foundation-economy-energy", "0.0.0")
  .display({
    label: { ja: "スタミナ", en: "Stamina" },
    description: {
      ja: "時間経過で回復するスタミナ（行動力）を管理します。",
      en: "Manages a stamina/energy meter that recovers over time.",
    },
  })
  .displayType(Energy, {
    label: { ja: "スタミナ", en: "Stamina" },
    description: {
      ja: "スタミナの初期値・上限・回復間隔とプレイヤーの現在値を管理します。",
      en: "Manages stamina defaults, capacity, recovery interval, and each player's current value.",
    },
  })
  .domainType(Energy)

  .masterDataResource(r =>
    r
      .model(GS2.stamina.Namespace)
      .bindings({
        name: Bind.static("Energy"),
        overflowTriggerScript: Bind.null(),
        logSetting: Bind.null(),
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
      .addChild(StaminaModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.stamina.Stamina)
      .linkedMasterResourceId(StaminaModel)
      .mountLocal(Energy)
      .bindings({
        value: Bind.domainProperties([Source.direct(Energy, "currentValue")]),
        maxValue: Bind.domainProperties([Source.direct(Energy, "currentMaximumValue")]),
        nextRecoverAt: Bind.domainProperties([Source.direct(Energy, "nextRecoverdAt")]),
        overflowValue: Bind.skip(),
        staminaName: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("ConsumeEnergy", at =>
    at
      .category("consume")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Stamina:ConsumeStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("staminaName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("consumeValue", "value")
      )
  )
  .actionTransform("RecoveryEnergy", at =>
    at
      .category("acquire")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Stamina:RecoverStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapResourceKey("staminaName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("recoverValue", "value")
      )
  )
  .build();
