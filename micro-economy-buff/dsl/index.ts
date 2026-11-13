import {
  Bind,
  Cond,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSettingV2,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

const schedule = dependencyPackage(scheduleSurface);

const SCHEDULE_NAMESPACE_RESOURCE_ID = schedule.resourceId("schedule.Namespace");
const SCHEDULE_EVENT_TYPE_ID = schedule.typeId("Schedule");

const Buff = defineDomainType("Buff", dt =>
  dt
    .property(
      PT.prop("expression", PT.enum("rate_add", "mul", "value_add"))
        .masterData()
        .required()
    )
    .property(PT.prop("targetType", PT.enum("action", "model")).masterData().required())
    .property(
      PT.string("targetActionName").masterData().requiredWhen(Cond.eq("targetType", "action"))
    )
    .property(
      PT.string("targetModelName").masterData().requiredWhen(Cond.eq("targetType", "model"))
    )
    .property(PT.string("targetFieldName").masterData().required())
    .property(PT.string("conditionModelName").masterData().required())
    .property(PT.string("conditionGrn").masterData().required())
    .property(PT.float32("rate").masterData().required())
    .property(PT.int32("priority").masterData().required())
    .property(PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID)).assetDelivery())
    .localizedProperties({
      id: jaEnId("バフ", "buff"),
      expression: jaEnField(
        "計算方式",
        "Expression",
        "補正値を元の値へ加算または乗算する方式です。",
        "How the modifier is combined with the original value."
      ),
      targetType: jaEnField(
        "対象の種類",
        "Target type",
        "アクションのリクエストを補正するか、モデルのフィールドを補正するかです。",
        "Whether an action's request or a model's field is modified."
      ),
      targetActionName: jaEnField(
        "対象アクション",
        "Target action",
        "補正対象にするGS2アクション名です。",
        "GS2 action whose value is modified."
      ),
      targetModelName: jaEnField(
        "対象モデル",
        "Target model",
        "補正対象にするGS2モデル名です。",
        "GS2 model whose field is modified."
      ),
      targetFieldName: jaEnField(
        "対象フィールド",
        "Target field",
        "対象アクションまたはモデルの中で補正するフィールド名です。",
        "Field within the target action or model that is modified."
      ),
      conditionModelName: jaEnField(
        "条件モデル",
        "Condition model",
        "適用条件の GRN が指すモデル名です。",
        "Model the condition GRN refers to."
      ),
      conditionGrn: jaEnField(
        "条件 GRN",
        "Condition GRN",
        "このバフを適用する対象の GRN です。",
        "GRN of what this buff applies to."
      ),
      rate: jaEnField(
        "補正値",
        "Modifier value",
        "対象フィールドへ適用する倍率または加算値です。",
        "Multiplier or additive value applied to the target field."
      ),
      priority: jaEnField(
        "優先度",
        "Priority",
        "同じフィールドへ複数のバフを適用する順序です。",
        "Order used when multiple buffs affect the same field."
      ),
      schedule: jaEnField(
        "有効期間",
        "Active schedule",
        "このバフを有効にするスケジュールです。",
        "Schedule during which this buff is active."
      ),
    })
);

const BuffEntryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.buff.BuffEntryModel)
    .mountLocal(Buff)
    .bindings({
      name: Bind.domainProperty(Source.direct(Buff, "id")),
      metadata: Bind.static(""),
      expression: Bind.domainProperty(Source.direct(Buff, "expression")),
      targetType: Bind.domainProperty(Source.direct(Buff, "targetType")),
      priority: Bind.domainProperty(Source.direct(Buff, "priority")),
    })
    .addArrayChild("targetAction", targetAction => {
      targetAction
        .model(GS2.buff.BuffTargetAction)
        .mountLocal(Buff)
        .bindings({
          targetActionName: Bind.domainProperty(Source.direct(Buff, "targetActionName")),
          targetFieldName: Bind.domainProperty(Source.direct(Buff, "targetFieldName")),
          rate: Bind.domainProperty(Source.direct(Buff, "rate")),
        })
        .addArrayChild("conditionGrns", condition => {
          condition
            .model(GS2.buff.BuffTargetGrn)
            .mountLocal(Buff)
            .bindings({
              targetModelName: Bind.domainProperty(Source.direct(Buff, "conditionModelName")),
              targetGrn: Bind.domainProperty(Source.direct(Buff, "conditionGrn")),
            });
        });
    })
    .addArrayChild("targetModel", targetModel => {
      targetModel
        .model(GS2.buff.BuffTargetModel)
        .mountLocal(Buff)
        .bindings({
          targetModelName: Bind.domainProperty(Source.direct(Buff, "targetModelName")),
          targetFieldName: Bind.domainProperty(Source.direct(Buff, "targetFieldName")),
          rate: Bind.domainProperty(Source.direct(Buff, "rate")),
        })
        .addArrayChild("conditionGrns", condition => {
          condition
            .model(GS2.buff.BuffTargetGrn)
            .mountLocal(Buff)
            .bindings({
              targetModelName: Bind.domainProperty(Source.direct(Buff, "conditionModelName")),
              targetGrn: Bind.domainProperty(Source.direct(Buff, "conditionGrn")),
            });
        });
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

export const microEconomyBuff = definePackage("micro-economy-buff", "0.0.1")
  .display({
    ja: {
      label: "バフ",
      description:
        "報酬の獲得量などを一時的に倍率で増減させます。対象のアクションまたはモデルと期間を指定できます。",
    },
    en: {
      label: "Buffs",
      description:
        "Temporarily scales what a service hands out, targeted by action or model and limited to a period.",
    },
  })
  .displayType(Buff, {
    ja: {
      label: "バフ",
      description: "一時的な能力補正の効果量、有効期間、重複ルールを設定します。",
    },
    en: {
      label: "Buff",
      description: "Defines a temporary stat modifier's effect, duration, and stacking rules.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(Buff)

  .masterDataResource(r =>
    r
      .model(GS2.buff.Namespace)
      .bindings({
        name: Bind.static("Buff"),
        ...Bind.nulls("applyBuffScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      })
      .addChild(BuffEntryModel)
  )
  .build();
