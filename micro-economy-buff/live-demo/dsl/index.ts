import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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

/** Restrict the buff to the shared idle category so other idle content is not multiplied. */
const IDLE_CATEGORY_GRN = "grn:gs2:{region}:{ownerId}:idle:Idle:model:Idle";

const Buff = defineOverlayDomainType("Buff", buff.overlay("Buff"));

/** Give campaign controls their own model because the page does not load the buff model itself. */
const BuffCampaign = defineDomainType("BuffCampaign", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "キャンペーン", description: "放置報酬 2 倍のキャンペーンです。" },
      en: { label: "Campaign", description: "The double idle rewards campaign." },
    },
  })
);

const StartRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(BuffCampaign)
    .bindings({ name: Bind.domainProperty(Source.direct(BuffCampaign, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(BuffCampaign)
        .bindings({
          action: Bind.transform(schedule.packageId, "PullTrigger", [
            Arg.static("trigger", CAMPAIGN_TRIGGER),
            Arg.static("ttlSeconds", CAMPAIGN_SECONDS),
          ]),
        });
    })
);

const EndRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(BuffCampaign)
    .bindings({ name: Bind.domainProperty(Source.direct(BuffCampaign, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(BuffCampaign)
        .bindings({
          action: Bind.transform(schedule.packageId, "ClearTrigger", [
            Arg.static("trigger", CAMPAIGN_TRIGGER),
          ]),
        });
    })
);

/** Separate namespaces because both campaign operations derive the same rate name. */
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
    transactionSetting: transactionSetting({
      enableAtomicCommit: Bind.static(true),
      enableAutoRun: Bind.static(true),
    }),
  };
}

export const microEconomyBuffDemo = definePackage("micro-economy-buff-demo", "0.0.0")
  .display({
    label: { ja: "バフ（デモデータ）", en: "Buffs (demo data)" },
    description: {
      ja: "ライブデモ用に、キャンペーン中は放置報酬を 2 倍にするバフと、キャンペーンの開始・終了の操作を提供します。",
      en: "Supplies the live demo's buff that doubles idle rewards during a campaign, and the presses that start and end the campaign.",
    },
  })
  .displayType(Buff, {
    label: { ja: "バフ", en: "Buff" },
    description: {
      ja: "デモのバフです。キャンペーン中の放置報酬を 2 倍にします。",
      en: "The demo buff, which doubles idle rewards during the campaign.",
    },
  })
  .displayType(BuffCampaign, {
    label: { ja: "キャンペーン", en: "Campaign" },
    description: {
      ja: "キャンペーンの開始・終了の操作と説明です。",
      en: "The campaign's start and end presses and its rule.",
    },
  })
  .dependency(buff.packageId, "github:gs2io/gs2-studio-package")
  .dependency(schedule.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared schedule content so this demo cannot replace its event windows with a different stack.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency(idle.packageId, "github:gs2io/gs2-studio-package")
  .dependency(idleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the shared wallet and store products deploy identically.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(Buff)
  .domainType(BuffCampaign)

  .instance(Buff.typeName, "double-idle", {
    [buff.propertyId("Buff", "expression")]: "mul",
    [buff.propertyId("Buff", "targetType")]: "model",
    [buff.propertyId("Buff", "targetModelName")]: "Gs2Idle:CategoryModel",
    [buff.propertyId("Buff", "targetFieldName")]: "acquireActions",
    [buff.propertyId("Buff", "conditionModelName")]: "Gs2Idle:CategoryModel",
    [buff.propertyId("Buff", "conditionGrn")]: IDLE_CATEGORY_GRN,
    [buff.propertyId("Buff", "rate")]: CAMPAIGN_RATE,
    [buff.propertyId("Buff", "priority")]: 0,
    [buff.propertyId("Buff", "schedule")]: CAMPAIGN_TRIGGER,
  })
  .instance(BuffCampaign, "buffcampaign", {})

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(campaignExchange("BuffCampaignStart"))
      .addChild(StartRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(campaignExchange("BuffCampaignEnd"))
      .addChild(EndRateModel)
  )

  .uiComponent(BuffCampaign, ui =>
    ui
      .templateLabel(
        "RuleLabel",
        `During a campaign, idle rewards are multiplied by ${CAMPAIGN_RATE}. The buff applies when you receive, so everything built up at that moment is doubled. A campaign runs for ${CAMPAIGN_SECONDS / 3600} hours.`,
        {},
        { name: "BuffCampaign" }
      )
      .buttonAction("StartCampaignButton", "StartCampaign", undefined, { name: "BuffCampaign" })
      .buttonAction("EndCampaignButton", "EndCampaign", undefined, { name: "BuffCampaign" })
  )
  .delegatedAction(BuffCampaign, "StartCampaign", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: StartRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(BuffCampaign, "EndCampaign", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: EndRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
