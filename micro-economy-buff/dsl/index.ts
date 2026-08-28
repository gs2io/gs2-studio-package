import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** The schedule namespace a buff's active period is read from. */
const SCHEDULE_NAMESPACE_RESOURCE_ID = "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d";
const SCHEDULE_EVENT_TYPE_ID = "dt_55N8HND2SNZV1ZMCJS4NA2BTFD";

/**
 * A multiplier applied to what an action hands out — a double-drop campaign, a
 * first-week experience boost. The buff names the action and the field it
 * scales, so nothing that grants rewards has to know a buff exists.
 *
 * Buffs target either an action's request or a model's field; this package
 * ships the action flavour, which is what campaign multipliers use.
 */
const Buff = defineDomainType("Buff", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.prop("expression", PT.enum("rate_add", "mul", "value_add"))
        .masterData()
        .required()
        .description("How the rate combines with the original value")
    )
    .property(
      PT.string("targetActionName")
        .masterData()
        .required()
        .description("Action whose result is scaled, e.g. Gs2Inventory:AcquireItemSetByUserId")
    )
    .property(
      PT.string("targetFieldName")
        .masterData()
        .required()
        .description("Field of that action's request to scale, e.g. acquireCount")
    )
    .property(PT.float32("rate").masterData().required().description("Multiplier applied"))
    .property(
      PT.int32("priority")
        .masterData()
        .required()
        .description("Order among buffs touching the same field")
    )
    .property(
      PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID))
        .assetDelivery()
        .description("Period the buff is active for")
    )
);

const BuffEntryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.buff.BuffEntryModel)
    .mountLocal(Buff)
    .bindings({
      name: Bind.domainProperty(Source.direct(Buff, "id")),
      metadata: Bind.static(""),
      expression: Bind.domainProperty(Source.direct(Buff, "expression")),
      targetType: Bind.static("action"),
      priority: Bind.domainProperty(Source.direct(Buff, "priority")),
      targetAction: {
        targetActionName: Bind.domainProperty(Source.direct(Buff, "targetActionName")),
        targetFieldName: Bind.domainProperty(Source.direct(Buff, "targetFieldName")),
        rate: Bind.domainProperty(Source.direct(Buff, "rate")),
        // Unconditional: the buff applies wherever the named action runs.
        conditionGrns: Bind.static([]),
      },
    })
    .grnFieldMount("applyPeriodScheduleEventId", SCHEDULE_NAMESPACE_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "applyPeriodScheduleEventId",
      "eventName",
      Bind.domainProperty(Source.direct(Buff, "schedule"))
    )
);

export const microEconomyBuff = definePackage("micro-economy-buff", "0.0.0")
  .display({
    label: { ja: "バフ", en: "Buffs" },
    description: {
      ja: "報酬の獲得量などを一時的に倍率で増減させます。対象のアクションと期間を指定できます。",
      en: "Temporarily scales what an action hands out, targeted by action and limited to a period.",
    },
  })
  .displayType(Buff, {
    label: { ja: "バフ", en: "Buff" },
    description: {
      ja: "一時的な能力補正の効果量、有効期間、重複ルールを設定します。",
      en: "Defines a temporary stat modifier's effect, duration, and stacking rules.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(Buff)

  .masterDataResource(r =>
    r
      .model(GS2.buff.Namespace)
      .bindings({
        name: Bind.static("Buff"),
        applyBuffScript: Bind.null(),
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
      .addChild(BuffEntryModel)
  )
  .build();
