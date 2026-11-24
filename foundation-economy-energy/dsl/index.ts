import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
} from "gs2-studio-dsl";
import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Energy = defineDomainType("Energy", dt =>
  dt
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
        "プレイヤーの通常のスタミナ上限の初期値（GS2 Stamina の initialCapacity）です。",
        "Starting normal stamina capacity of each player (GS2 Stamina initialCapacity).",
        { ja: "ポイント", en: "points" }
      ),
      useOverflow: jaEnField(
        "上限超過を許可",
        "Allow overflow",
        "RecoveryEnergy などの回復アクションで、現在の上限を超えて overflowedMaximum までスタミナを増やせるかを設定します（GS2 Stamina の isOverflow）。時間経過による回復は現在の上限で止まります。",
        "Whether recovery actions such as RecoveryEnergy may raise stamina above the current maximum, up to overflowedMaximum (GS2 Stamina isOverflow). Time-based recovery still stops at the current maximum."
      ),
      overflowedMaximum: jaEnField(
        "超過時上限",
        "Overflow maximum",
        "上限超過分を含めたスタミナの絶対上限（GS2 Stamina の maxCapacity）で、defaultMaximum 以上にします。useOverflow が true のときだけデプロイされ、false のときは defaultMaximum と同じ値を入れます。",
        "Absolute stamina cap including overflow (GS2 Stamina maxCapacity), at least defaultMaximum. Deployed only when useOverflow is true; otherwise set it to defaultMaximum.",
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
        "プレイヤーが現在持っているスタミナ（GS2 Stamina の value）です。上限超過で保持している分は含まず、超過分はこの型では参照できません。",
        "Player's current stamina (GS2 Stamina value), excluding any overflow held above the current maximum. The overflow amount is not exposed by this type.",
        { ja: "ポイント", en: "points" }
      ),
      currentMaximumValue: jaEnField(
        "現在の上限",
        "Current maximum",
        "プレイヤーに適用されている現在のスタミナ上限（GS2 Stamina の maxValue）です。時間経過による回復はこの値で止まります。",
        "Stamina capacity currently applied to the player (GS2 Stamina maxValue). Time-based recovery stops at this value.",
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

const ENERGY_PARAMETER = "Id of the Energy row, which is the GS2 Stamina model name.";

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
      ...Bind.nulls("maxStaminaTable", "recoverIntervalTable", "recoverValueTable"),
    })
);

export const foundationEconomyEnergy = definePackage("foundation-economy-energy", "0.0.1")
  .display({
    ja: { label: "スタミナ", description: "時間経過で回復するスタミナ（行動力）を管理します。" },
    en: { label: "Stamina", description: "Manages a stamina meter that recovers over time." },
  })
  .displayType(Energy, {
    ja: {
      label: "スタミナ",
      description: "スタミナの初期値・上限・回復間隔とプレイヤーの現在値を管理します。",
    },
    en: {
      label: "Stamina",
      description:
        "Manages stamina defaults, capacity, recovery interval, and each player's current value.",
    },
  })
  .domainType(Energy)

  .masterDataResource(r =>
    r
      .model(GS2.stamina.Namespace)
      .bindings({
        name: Bind.static("Energy"),
        ...Bind.nulls("overflowTriggerScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
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

  // The stamina name varies per row, so callers supply it; only the static namespace can be read as a resource key.
  .actionTransform("ConsumeEnergy", at =>
    at
      .category("consume")
      .parameter("energy", { type: PT.ref("Energy"), description: ENERGY_PARAMETER })
      .parameter("value", { type: PT.int32(), description: "Amount of stamina to consume." })
      .output("Gs2Stamina:ConsumeStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapParameter("staminaName", "energy")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("consumeValue", "value")
      )
  )
  .uiComponent(Energy, ui =>
    ui
      // Use the player's current capacity because it may exceed the authored default.
      .gauge("StaminaGauge", ui.prop("currentValue"), ui.prop("currentMaximumValue"), {
        name: "Energy",
        clamp: true,
      })
      .templateLabel(
        "StaminaLabel",
        "{currentValue}/{currentMaximumValue}",
        {
          currentValue: ui.prop("currentValue"),
          currentMaximumValue: ui.prop("currentMaximumValue"),
        },
        { name: "Energy" }
      )
      .value("NextRecoveryValue", ui.prop("nextRecoverdAt"), { name: "Energy" })
      // Expose full state so pages can hide an unset recovery timestamp instead of showing an epoch date.
      .activeToggle(
        "FullActiveToggle",
        UiCond.gte(ui.prop("currentValue"), ui.prop("currentMaximumValue")),
        { name: "Energy" }
      )
  )

  .actionTransform("RecoveryEnergy", at =>
    at
      .category("acquire")
      .parameter("energy", { type: PT.ref("Energy"), description: ENERGY_PARAMETER })
      .parameter("value", { type: PT.int32(), description: "Amount of stamina to recover." })
      .output("Gs2Stamina:RecoverStaminaByUserId", o =>
        o
          .resourceRef(() => StaminaModel)
          .mapResourceKey("namespaceName")
          .mapParameter("staminaName", "energy")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("recoverValue", "value")
      )
  )
  .build();
