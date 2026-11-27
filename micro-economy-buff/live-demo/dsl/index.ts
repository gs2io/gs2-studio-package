import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  Source,
  transactionSettingV2,
  UiItem,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import buffSurface from "../../dsl/dependency-surface.json";

import scheduleDemoSurface from "../../../foundation-economy-schedule/live-demo/dsl/dependency-surface.json";

import scheduleSurface from "../../../foundation-economy-schedule/dsl/dependency-surface.json";

import idleDemoSurface from "../../../foundation-economy-idle/live-demo/dsl/dependency-surface.json";

import idleSurface from "../../../foundation-economy-idle/dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const buff = dependencyPackage(buffSurface);

const schedule = dependencyPackage(scheduleSurface);

const scheduleDemo = dependencyPackage(scheduleDemoSurface);

const idle = dependencyPackage(idleSurface);

const idleDemo = dependencyPackage(idleDemoSurface);

const currency = dependencyPackage(currencySurface);

const CAMPAIGN_TRIGGER = "happy-hour";

const CAMPAIGN_SECONDS = 24 * 60 * 60;

const CAMPAIGN_RATE = 2;

const IDLE_CATEGORY_GRN = "grn:gs2:{region}:{ownerId}:idle:Idle:model:Idle";

const Buff = defineOverlayDomainType("Buff", buff.overlay("Buff"), {
  localizedDisplay: {
    ja: { label: "バフ", description: "デモのバフです。キャンペーン中の放置報酬を 2 倍にします。" },
    en: {
      label: "Buff",
      description: "The demo buff, which doubles idle rewards during the campaign.",
    },
  },
});

const BuffCampaign = defineDomainType("BuffCampaign", {
  singleEntry: true,
  localizedDisplay: {
    ja: { label: "キャンペーン", description: "キャンペーンの開始・終了の操作と説明です。" },
    en: { label: "Campaign", description: "The campaign's start and end presses and its rule." },
  },
  localizedProperties: {
    id: {
      ja: { label: "キャンペーン", description: "放置報酬 2 倍のキャンペーンです。" },
      en: { label: "Campaign", description: "The double idle rewards campaign." },
    },
  },
});

const StartRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: BuffCampaign,
  bindings: { name: Bind.domainProperty(Source.direct(BuffCampaign, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: BuffCampaign,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("PullTrigger"), [
            Arg.static("trigger", CAMPAIGN_TRIGGER),
            Arg.static("ttlSeconds", CAMPAIGN_SECONDS),
          ]),
}),
    ],
  },
});

const EndRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: BuffCampaign,
  bindings: { name: Bind.domainProperty(Source.direct(BuffCampaign, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: BuffCampaign,
  actionProgram: ActionProgram.transform(schedule.packageId, schedule.transformId("ClearTrigger"), [
            Arg.static("trigger", CAMPAIGN_TRIGGER),
          ]),
}),
    ],
  },
});

function campaignExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    // Auto-run executes the transaction without a second client request after the exchange.
    transactionSettingV2: transactionSettingV2(),
  };
}

export const microEconomyBuffDemo = definePackage({
  id: "micro-economy-buff-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "バフ（デモデータ）",
      description:
        "ライブデモ用に、キャンペーン中は放置報酬を 2 倍にするバフと、キャンペーンの開始・終了の操作を提供します。",
    },
    en: {
      label: "Buffs (demo data)",
      description:
        "Supplies the live demo's buff that doubles idle rewards during a campaign, and the presses that start and end the campaign.",
    },
  },
  dependencies: liveDemoDependencies(
    buff.packageId,
    schedule.packageId,
    scheduleDemo.packageId,
    idle.packageId,
    idleDemo.packageId,
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  domainTypes: [Buff, BuffCampaign],
  instances: [
    instance(Buff, "double-idle", {
    [buff.propertyId("Buff", "expression")]: "mul",
    [buff.propertyId("Buff", "targetType")]: "model",
    [buff.propertyId("Buff", "targetModelName")]: "Gs2Idle:CategoryModel",
    [buff.propertyId("Buff", "targetFieldName")]: "acquireActions",
    [buff.propertyId("Buff", "conditionModelName")]: "Gs2Idle:CategoryModel",
    [buff.propertyId("Buff", "conditionGrn")]: IDLE_CATEGORY_GRN,
    [buff.propertyId("Buff", "rate")]: CAMPAIGN_RATE,
    [buff.propertyId("Buff", "priority")]: 0,
    [buff.propertyId("Buff", "schedule")]: CAMPAIGN_TRIGGER,
  }),
    instance(BuffCampaign, "buffcampaign", {}),
  ],
  delegatedActions: [
    { target: BuffCampaign, methodName: "StartCampaign", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: StartRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: BuffCampaign, methodName: "EndCampaign", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: EndRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: campaignExchange("BuffCampaignStart"),
  children: [
    StartRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: campaignExchange("BuffCampaignEnd"),
  children: [
    EndRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(BuffCampaign, {
  items: [
    UiItem.templateLabel("RuleLabel", `During a campaign, idle rewards are multiplied by ${CAMPAIGN_RATE}. The buff applies when you receive, so everything built up at that moment is doubled. A campaign runs for ${CAMPAIGN_SECONDS / 3600} hours.`, {}, { name: "BuffCampaign" }),
    UiItem.buttonAction("StartCampaignButton", "StartCampaign", undefined, { name: "BuffCampaign" }),
    UiItem.buttonAction("EndCampaignButton", "EndCampaign", undefined, { name: "BuffCampaign" }),
  ],
}),
  ],
});
