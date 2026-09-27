/**
 * Live demo content for `micro-economy-buff`.
 *
 * A buff scales what a service hands out for as long as it is active. This
 * demo doubles the idle rewards of the idle demo during a campaign: press
 * Start campaign, and whatever Receive pays while the campaign runs is doubled.
 * GS2 applies the buff when the rewards are paid, so it is everything built up
 * at that moment that doubles, however long ago it was earned.
 *
 * The feature package is the buff model and nothing a player presses. This
 * package adds the one buff (idle rewards times two), the campaign window it
 * runs in, and the presses that start and end it.
 *
 * **The window is a trigger.** The buff is active while the schedule demo's
 * relative event `happy-hour` is, and that event opens when the player pulls
 * its trigger. A client may not pull a trigger itself, so Start campaign is a
 * free exchange whose only acquire action pulls it, for a day; End campaign is
 * another whose only consume action clears it. Both rates live in this demo's
 * own stack: the schedule, the event and the trigger stay the schedule demo's.
 *
 * **Applying the buff is the page's.** GS2 hands a player the buffs active now
 * as a signed context the client sends with later requests; no package action
 * does that, so it is a hand-written Unity component, which applies again
 * whenever the campaign starts, ends or runs out, and when the clock moves.
 *
 * **Hours pass on a button**, as in the idle demo, through this demo's own
 * client (`live-demo/client-stack.yaml`).
 *
 * The idle rewards, the wallet and the schedule are other packages' and are
 * installed beside this one rather than written out again: their rows live in
 * stacks every demo holding them deploys, and a second author of them would be
 * a second version, and the last deploy would win.
 */

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

/** The schedule demo's relative event and the trigger that opens it. */
const CAMPAIGN_TRIGGER = "happy-hour";

/** How long one press of Start campaign keeps the campaign open. */
const CAMPAIGN_SECONDS = 24 * 60 * 60;

/** What the campaign does to idle rewards. */
const CAMPAIGN_RATE = 2;

/**
 * The idle demo's one category, as GS2 names it. The buff applies only where
 * its condition matches, and this is the category it is for.
 */
const IDLE_CATEGORY_GRN = "grn:gs2:{region}:{ownerId}:idle:Idle:model:Idle";

/** The buff, overlaid so this package can author its one row. */
const Buff = defineOverlayDomainType("Buff", buff.overlay("Buff"));

/**
 * The campaign: what the page's presses and rule hang from, and what the
 * campaign rates are mounted on. It is a type of its own rather than the buff
 * because the page reads nothing off the buff: what the buff scales is GS2's
 * business, and the campaign is the page's.
 */
const BuffCampaign = defineDomainType("BuffCampaign", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "キャンペーン", description: "放置報酬 2 倍のキャンペーンです。" },
      en: { label: "Campaign", description: "The double idle rewards campaign." },
    },
  })
);

/**
 * Starting the campaign, modelled as an exchange that costs nothing: the
 * acquire action pulls the trigger. The rate is named after the campaign and
 * mounted on it, because a delegated action on the campaign must target a
 * resource that mounts it.
 */
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

/** Ending the campaign early: the consume action clears the trigger. */
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

/**
 * One exchange namespace per press: both rates are named after the campaign,
 * and sharing a namespace would collide them on their primary key.
 */
function campaignExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    // Run and committed server-side: with auto-run off, `Exchange` only hands
    // back a stamp sheet the client has to execute through the distributor.
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
  // The campaign's event and trigger live in the schedule stack this demo
  // deploys too; deployed from here without them, that stack would lose them.
  .dependency(scheduleDemo.packageId, "github:gs2io/gs2-studio-package")
  // What the buff doubles.
  .dependency(idle.packageId, "github:gs2io/gs2-studio-package")
  .dependency(idleDemo.packageId, "github:gs2io/gs2-studio-package")
  // Where the idle rewards pay.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo stocks the currency shop's price table, and an install
  // does not walk a package's own dependencies, so the shop is named too.
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

  // The feature package ships no components: what a title shows of a buff is
  // the title's decision.
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
