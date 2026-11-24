import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const UsageLimit = defineDomainType("UsageLimit", {
  properties: {
    resetType: PT.enum("notReset", "daily", "weekly", "monthly", "days").masterData().required(),
    resetDayOfWeek: PT.enum("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday").masterData(),
    resetDayOfMonth: PT.int32().masterData(),
    resetHour: PT.int32().masterData(),
    days: PT.int32().masterData(),
    anchorTimestamp: PT.timestamp().masterData(),
  },
  localizedDisplay: {
    ja: {
      label: "リセット設定",
      description: "利用回数カウンターのリセット方法と周期を設定します。",
    },
    en: {
      label: "Reset schedule",
      description: "Configures how and when a usage counter is reset.",
    },
  },
  localizedProperties: {
      id: jaEnId("リセット設定", "reset schedule"),
      resetType: jaEnField(
        "リセット方式",
        "Reset type",
        "利用回数をリセットする周期の種類です。",
        "Cadence used to reset usage counts."
      ),
      resetDayOfWeek: jaEnField(
        "リセット曜日",
        "Reset weekday",
        "週次リセットを実行する曜日です。",
        "Weekday on which a weekly reset occurs."
      ),
      resetDayOfMonth: jaEnField(
        "リセット日",
        "Reset day of month",
        "月次リセットを実行する日です。",
        "Day of the month on which a monthly reset occurs.",
        { ja: "日", en: "day" }
      ),
      resetHour: jaEnField(
        "リセット時刻",
        "Reset hour",
        "リセットを実行するUTC時刻です。",
        "UTC hour at which the reset occurs.",
        { ja: "時", en: "hour" }
      ),
      days: jaEnField(
        "リセット間隔",
        "Reset interval",
        "日数指定方式でリセットする間隔です。",
        "Number of days between resets for the days-based cadence.",
        { ja: "日", en: "days" }
      ),
      anchorTimestamp: jaEnField(
        "基準日時",
        "Anchor time",
        "日数指定方式のリセット周期を数える基準日時です。",
        "Reference time used to calculate a days-based reset cadence."
      ),
    },
});

const UsageLimitCounter = defineDomainType("UsageLimitCounter", {
  properties: {
    limit: PT.ref(UsageLimit).assetDelivery().required(),
    count: PT.int64().userData().required(),
    nextResetAt: PT.timestamp().userData().required(),
  },
  localizedDisplay: {
    ja: { label: "回数カウンター", description: "プレイヤーごとの利用回数と上限を管理します。" },
    en: { label: "Usage counter", description: "Tracks each player's usage count and its limit." },
  },
  localizedProperties: {
      id: jaEnId("回数カウンター", "usage counter"),
      limit: jaEnField(
        "リセット設定",
        "Reset schedule",
        "このカウンターが従うリセット設定です。",
        "Reset schedule followed by this counter."
      ),
      count: jaEnField(
        "利用回数",
        "Usage count",
        "前回のリセット以降に利用した回数です。",
        "Number of uses since the previous reset.",
        { ja: "回", en: "uses" }
      ),
      nextResetAt: jaEnField(
        "次回リセット日時",
        "Next reset time",
        "このカウンターを次にリセットする日時です。",
        "Time when this counter will next be reset."
      ),
    },
});

const LimitModel = defineMasterDataResource({
  model: GS2.limit.LimitModel,
  mount: UsageLimit,
  bindings: {
      name: Bind.domainProperty(Source.direct(UsageLimit, "id")),
      metadata: Bind.static(""),
      resetType: Bind.domainProperty(Source.direct(UsageLimit, "resetType")),
      resetDayOfWeek: Bind.domainProperty(Source.direct(UsageLimit, "resetDayOfWeek")),
      resetDayOfMonth: Bind.domainProperty(Source.direct(UsageLimit, "resetDayOfMonth")),
      resetHour: Bind.domainProperty(Source.direct(UsageLimit, "resetHour")),
      days: Bind.domainProperty(Source.direct(UsageLimit, "days")),
      anchorTimestamp: Bind.domainProperty(Source.direct(UsageLimit, "anchorTimestamp")),
    },
});

const CountUpUsageLimitTransform = defineActionTransform("CountUpUsageLimit", {
  category: "consume",
  parameters: {
    limit: { type: PT.ref(UsageLimit) },
    counter: { type: PT.ref(UsageLimitCounter) },
    countUpValue: { type: PT.int32() },
    maxValue: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:CountUpByUserId",
    resource: () => LimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      limitName: OutputMap.parameter("limit"),
      counterName: OutputMap.parameter("counter"),
      userId: OutputMap.placeholder("#{userId}"),
      countUpValue: OutputMap.parameter("countUpValue"),
      maxValue: OutputMap.parameter("maxValue"),
    },
  },
  ],
});

const VerifyUsageLimitNotReachedTransform = defineActionTransform("VerifyUsageLimitNotReached", {
  category: "verify",
  parameters: {
    limit: { type: PT.ref(UsageLimit) },
    counter: { type: PT.ref(UsageLimitCounter) },
    maxValue: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:VerifyCounterByUserId",
    resource: () => LimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      limitName: OutputMap.parameter("limit"),
      counterName: OutputMap.parameter("counter"),
      verifyType: OutputMap.static("less"),
      count: OutputMap.parameter("maxValue"),
      multiplyValueSpecifyingQuantity: OutputMap.static(false),
    },
  },
  ],
});

const CountDownUsageLimitTransform = defineActionTransform("CountDownUsageLimit", {
  category: "acquire",
  parameters: {
    limit: { type: PT.ref(UsageLimit) },
    counter: { type: PT.ref(UsageLimitCounter) },
    countDownValue: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:CountDownByUserId",
    resource: () => LimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      limitName: OutputMap.parameter("limit"),
      counterName: OutputMap.parameter("counter"),
      userId: OutputMap.placeholder("#{userId}"),
      countDownValue: OutputMap.parameter("countDownValue"),
    },
  },
  ],
});

const ResetUsageLimitCounterTransform = defineActionTransform("ResetUsageLimitCounter", {
  category: "acquire",
  parameters: {
    limit: { type: PT.ref(UsageLimit) },
    counter: { type: PT.ref(UsageLimitCounter) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Limit:DeleteCounterByUserId",
    resource: () => LimitModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      limitName: OutputMap.parameter("limit"),
      userId: OutputMap.placeholder("#{userId}"),
      counterName: OutputMap.parameter("counter"),
    },
  },
  ],
});

export const foundationEconomyLimit = definePackage({
  id: "foundation-economy-limit",
  version: "0.0.1",
  display: {
    ja: {
      label: "回数制限",
      description:
        "「1日3回まで」のような回数制限を扱います。リセットのタイミングを共有しつつ、数える対象ごとにカウンターを分けられます。上限は使う側が指定します。",
    },
    en: {
      label: "Usage Limits",
      description:
        "Handles allowances such as 'three times a day': one reset schedule, a separate counter per thing being counted, and a maximum supplied by the caller.",
    },
  },
  domainTypes: [UsageLimit, UsageLimitCounter],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.limit.Namespace,
  bindings: {
        name: Bind.static("Limit"),
        ...Bind.nulls("countUpScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    LimitModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.limit.Counter,
  mount: UsageLimitCounter,
  linkedMaster: LimitModel,
  bindings: {
        name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")),
        count: Bind.domainProperties([Source.direct(UsageLimitCounter, "count")]),
        nextResetAt: Bind.domainProperties([Source.direct(UsageLimitCounter, "nextResetAt")]),
        counterId: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [CountUpUsageLimitTransform, VerifyUsageLimitNotReachedTransform, CountDownUsageLimitTransform, ResetUsageLimitCounterTransform],
});
