import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/**
 * A reset cadence — "daily", "every Monday", "every 7 days". The counters that
 * follow it are separate rows, so one cadence can govern many independent
 * allowances (a daily reset shared by every once-a-day thing in the game).
 *
 * The maximum is deliberately *not* stored here: GS2-Limit takes it at
 * count-up time so the same limit can allow a different number of uses
 * depending on context (a step-up shop offering a cheaper tier below three
 * purchases and a pricier one below five).
 */
const UsageLimit = defineDomainType("UsageLimit", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.prop("resetType", PT.enum("notReset", "daily", "weekly", "monthly", "days"))
        .masterData()
        .required()
        .description("When the counts return to zero")
    )
    .property(
      PT.prop(
        "resetDayOfWeek",
        PT.enum("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
      )
        .masterData()
        .description("Reset weekday (weekly only)")
    )
    .property(PT.int32("resetDayOfMonth").masterData().description("Reset day (monthly only)"))
    .property(PT.int32("resetHour").masterData().description("Reset hour, UTC"))
    .property(PT.int32("days").masterData().description("Reset interval in days (days only)"))
    .property(
      PT.timestamp("anchorTimestamp").masterData().description("Interval origin (days only)")
    )
);

/**
 * One counted allowance: how many times this player has done a particular
 * thing since the limit it hangs off last reset. Counters are what a feature
 * actually points at — one per quest, per shop item, per anything that needs
 * its own tally — while the reset schedule stays shared.
 */
const UsageLimitCounter = defineDomainType("UsageLimitCounter", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.prop("limit", PT.ref("UsageLimit"))
        .assetDelivery()
        .required()
        .description("The reset cadence this counter follows")
    )
    .property(
      PT.int64("count").userData().required().description("Times used since the last reset")
    )
    .property(PT.timestamp("nextResetAt").userData().required().description("Next reset time"))
);

const LimitModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.limit.LimitModel)
    .mountLocal(UsageLimit)
    .bindings({
      name: Bind.domainProperty(Source.direct(UsageLimit, "id")),
      metadata: Bind.static(""),
      resetType: Bind.domainProperty(Source.direct(UsageLimit, "resetType")),
      resetDayOfWeek: Bind.domainProperty(Source.direct(UsageLimit, "resetDayOfWeek")),
      resetDayOfMonth: Bind.domainProperty(Source.direct(UsageLimit, "resetDayOfMonth")),
      resetHour: Bind.domainProperty(Source.direct(UsageLimit, "resetHour")),
      days: Bind.domainProperty(Source.direct(UsageLimit, "days")),
      anchorTimestamp: Bind.domainProperty(Source.direct(UsageLimit, "anchorTimestamp")),
    })
);

export const foundationEconomyLimit = definePackage("foundation-economy-limit", "0.0.0")
  .display({
    label: { ja: "回数制限", en: "Usage Limits" },
    description: {
      ja: "「1日3回まで」のような回数制限を扱います。リセットのタイミングを共有しつつ、数える対象ごとにカウンターを分けられます。上限は使う側が指定します。",
      en: "Handles allowances such as 'three times a day': one reset schedule, a separate counter per thing being counted, and a maximum supplied by the caller.",
    },
  })
  .displayType(UsageLimit, {
    label: { ja: "リセット設定", en: "Reset schedule" },
    description: {
      ja: "利用回数カウンターのリセット方法と周期を設定します。",
      en: "Configures how and when a usage counter is reset.",
    },
  })
  .displayType(UsageLimitCounter, {
    label: { ja: "回数カウンター", en: "Usage counter" },
    description: {
      ja: "プレイヤーごとの利用回数と上限を管理します。",
      en: "Tracks each player's usage count and its limit.",
    },
  })
  .domainType(UsageLimit)
  .domainType(UsageLimitCounter)

  .masterDataResource(r =>
    r
      .model(GS2.limit.Namespace)
      .bindings({
        name: Bind.static("Limit"),
        countUpScript: Bind.null(),
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
      .addChild(LimitModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.limit.Counter)
      .mountLocal(UsageLimitCounter)
      .linkedMasterResourceId(LimitModel)
      .bindings({
        name: Bind.domainProperty(Source.direct(UsageLimitCounter, "id")),
        count: Bind.domainProperties([Source.direct(UsageLimitCounter, "count")]),
        nextResetAt: Bind.domainProperties([Source.direct(UsageLimitCounter, "nextResetAt")]),
        counterId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  // A counter is identified by the pair (limit, counter), so every transform
  // takes both. Pass the counter's own `limit` ref for the first argument to
  // keep the pair consistent.
  .actionTransform("CountUpUsageLimit", at =>
    at
      .category("consume")
      .parameter("limit", { type: PT.ref("UsageLimit") })
      .parameter("counter", { type: PT.ref("UsageLimitCounter") })
      .parameter("countUpValue", { type: PT.int32() })
      .parameter("maxValue", { type: PT.int32() })
      .output("Gs2Limit:CountUpByUserId", o =>
        o
          .resourceRef(() => LimitModel)
          .mapResourceKey("namespaceName")
          .mapParameter("limitName", "limit")
          .mapParameter("counterName", "counter")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("countUpValue", "countUpValue")
          .mapParameter("maxValue", "maxValue")
      )
  )
  .actionTransform("VerifyUsageLimitNotReached", at =>
    at
      .category("verify")
      .parameter("limit", { type: PT.ref("UsageLimit") })
      .parameter("counter", { type: PT.ref("UsageLimitCounter") })
      .parameter("maxValue", { type: PT.int32() })
      .output("Gs2Limit:VerifyCounterByUserId", o =>
        o
          .resourceRef(() => LimitModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("limitName", "limit")
          .mapParameter("counterName", "counter")
          .mapStatic("verifyType", "less")
          .mapParameter("count", "maxValue")
          .mapStatic("multiplyValueSpecifyingQuantity", false)
      )
  )
  .actionTransform("CountDownUsageLimit", at =>
    at
      .category("acquire")
      .parameter("limit", { type: PT.ref("UsageLimit") })
      .parameter("counter", { type: PT.ref("UsageLimitCounter") })
      .parameter("countDownValue", { type: PT.int32() })
      .output("Gs2Limit:CountDownByUserId", o =>
        o
          .resourceRef(() => LimitModel)
          .mapResourceKey("namespaceName")
          .mapParameter("limitName", "limit")
          .mapParameter("counterName", "counter")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("countDownValue", "countDownValue")
      )
  )
  .actionTransform("ResetUsageLimitCounter", at =>
    at
      .category("acquire")
      .parameter("limit", { type: PT.ref("UsageLimit") })
      .parameter("counter", { type: PT.ref("UsageLimitCounter") })
      .output("Gs2Limit:DeleteCounterByUserId", o =>
        o
          .resourceRef(() => LimitModel)
          .mapResourceKey("namespaceName")
          .mapParameter("limitName", "limit")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("counterName", "counter")
      )
  )
  .build();
