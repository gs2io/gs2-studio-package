import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Energy = defineDomainType("Energy", {
  properties: {
    defaultMaximum: PT.int32().masterData().required(),
    useOverflow: PT.bool().masterData().required(),
    overflowedMaximum: PT.int32().masterData().required(),
    recoveryIntervalMinutes: PT.int32().masterData().required(),
    recoveryValue: PT.int32().masterData().required(),
    currentValue: PT.int32().userData().required(),
    currentMaximumValue: PT.int32().userData().required(),
    nextRecoveredAt: PT.timestamp().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "スタミナ",
      description: "スタミナの初期値・上限・回復間隔とプレイヤーの現在値を管理します。",
    },
    en: {
      label: "Stamina",
      description:
        "Manages stamina defaults, capacity, recovery interval, and each player's current value.",
    },
  },
  localizedProperties: {
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
      nextRecoveredAt: jaEnField(
        "次回回復日時",
        "Next recovery time",
        "次にスタミナが自動回復する日時です。",
        "Time of the next automatic stamina recovery."
      ),
    },
});

const ENERGY_PARAMETER = "Id of the Energy row, which is the GS2 Stamina model name.";

const StaminaModel = defineMasterDataResource({
  model: GS2.stamina.StaminaModel,
  mount: Energy,
  bindings: {
      name: Bind.domainProperty(Source.direct(Energy, "id")),
      initialCapacity: Bind.domainProperty(Source.direct(Energy, "defaultMaximum")),
      isOverflow: Bind.domainProperty(Source.direct(Energy, "useOverflow")),
      maxCapacity: Bind.domainProperty(Source.direct(Energy, "overflowedMaximum")),
      recoverIntervalMinutes: Bind.domainProperty(Source.direct(Energy, "recoveryIntervalMinutes")),
      recoverValue: Bind.domainProperty(Source.direct(Energy, "recoveryValue")),
      ...Bind.nulls("maxStaminaTable", "recoverIntervalTable", "recoverValueTable"),
    },
});

const ConsumeEnergyTransform = defineActionTransform("ConsumeEnergy", {
  category: "consume",
  parameters: {
    energy: { type: PT.ref(Energy), description: ENERGY_PARAMETER },
    value: { type: PT.int32(), description: "Amount of stamina to consume." },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Stamina:ConsumeStaminaByUserId",
    resource: () => StaminaModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      staminaName: OutputMap.parameter("energy"),
      userId: OutputMap.placeholder("#{userId}"),
      consumeValue: OutputMap.parameter("value"),
    },
  },
  ],
});

const RecoveryEnergyTransform = defineActionTransform("RecoveryEnergy", {
  category: "acquire",
  parameters: {
    energy: { type: PT.ref(Energy), description: ENERGY_PARAMETER },
    value: { type: PT.int32(), description: "Amount of stamina to recover." },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Stamina:RecoverStaminaByUserId",
    resource: () => StaminaModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      staminaName: OutputMap.parameter("energy"),
      userId: OutputMap.placeholder("#{userId}"),
      recoverValue: OutputMap.parameter("value"),
    },
  },
  ],
});

export const foundationEconomyEnergy = definePackage({
  id: "foundation-economy-energy",
  version: "0.0.1",
  display: {
    ja: { label: "スタミナ", description: "時間経過で回復するスタミナ（行動力）を管理します。" },
    en: { label: "Stamina", description: "Manages a stamina meter that recovers over time." },
  },
  domainTypes: [Energy],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.stamina.Namespace,
  bindings: {
        name: Bind.static("Energy"),
        ...Bind.nulls("overflowTriggerScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    StaminaModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.stamina.Stamina,
  mount: Energy,
  linkedMaster: StaminaModel,
  bindings: {
        value: Bind.domainProperties([Source.direct(Energy, "currentValue")]),
        maxValue: Bind.domainProperties([Source.direct(Energy, "currentMaximumValue")]),
        nextRecoverAt: Bind.domainProperties([Source.direct(Energy, "nextRecoveredAt")]),
        overflowValue: Bind.skip(),
        staminaName: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [ConsumeEnergyTransform, RecoveryEnergyTransform],
  uiComponents: [
    defineUiComponent(Energy, {
  items: [
    UiItem.gauge("StaminaGauge", UiSource.prop("currentValue"), UiSource.prop("currentMaximumValue"), {
        name: "Energy",
        clamp: true,
      }),
    UiItem.templateLabel("StaminaLabel", "{currentValue}/{currentMaximumValue}", {
          currentValue: UiSource.prop("currentValue"),
          currentMaximumValue: UiSource.prop("currentMaximumValue"),
        }, { name: "Energy" }),
    UiItem.value("NextRecoveryValue", UiSource.prop("nextRecoveredAt"), { name: "Energy" }),
    UiItem.countdown("NextRecoveryCountdown", UiSource.prop("nextRecoveredAt"), { name: "Energy" }),
    UiItem.activeToggle("FullActiveToggle", UiCond.gte(UiSource.prop("currentValue"), UiSource.prop("currentMaximumValue")), { name: "Energy" }),
  ],
}),
  ],
});
