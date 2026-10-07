/** Own the redemption limit in a separate namespace so this demo cannot alter the shared usage-limit stack. */

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import serialCodeSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const serialCode = dependencyPackage(serialCodeSurface);
const currency = dependencyPackage(currencySurface);

const DEMO_PACKAGE_ID = "micro-liveops-serial-code-demo";

const SerialCodeCampaign = serialCode.type("SerialCodeCampaign");

const CAMPAIGN_CODE = "WELCOME2026";

const REWARD_COINS = 100;
const WALLET_SLOT = 0;

const CODE_CONFIG_KEY = "code";

/** Match the fixed lowercase single-entry identity used by the mounted redemption rate and limit. */
const REDEMPTION = "serialcoderedemption";

const REDEMPTION_COUNTER = "redeemed";
const REDEMPTIONS_PER_VISITOR = 1;

const CountRedemptionTransform = "CountRedemption";

const ClearRedemptionTransform = "ClearRedemption";

const SerialCodeRedemption = defineDomainType("SerialCodeRedemption", dt =>
  dt.singleEntry().localizedProperties({
    id: {
      ja: { label: "コードの引き換え", description: "シリアルコードの引き換えです。" },
      en: { label: "Code redemption", description: "Redeeming a serial code." },
    },
  })
);

const RedemptionLimitModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.limit.LimitModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({
      name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")),
      metadata: Bind.static(""),
      resetType: Bind.static("notReset"),
      ...Bind.nulls("resetDayOfWeek", "resetDayOfMonth", "resetHour", "days", "anchorTimestamp"),
    })
);

/** Pass the typed code at request time because it is not known when the redemption rate is deployed. */
const RedeemRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({ name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(DEMO_PACKAGE_ID, CountRedemptionTransform, []),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(serialCode.packageId, "UseSerialCode", [
            Arg.placeholder("code", `#{${CODE_CONFIG_KEY}}`),
          ]),
        });
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(currency.packageId, "DepositFreeCurrency", [
            Arg.static("slot", WALLET_SLOT),
            Arg.static("count", REWARD_COINS),
          ]),
        });
    })
);

const StartOverRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(SerialCodeRedemption)
    .bindings({ name: Bind.domainProperty(Source.direct(SerialCodeRedemption, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(SerialCodeRedemption)
        .bindings({
          action: Bind.transform(DEMO_PACKAGE_ID, ClearRedemptionTransform, []),
        });
    })
);

/** Separate namespaces to avoid duplicate redemption-derived rate names. Commit code use, redemption count and reward atomically so a failed attempt cannot leave a partial redemption. */
function redemptionExchange(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    transactionSetting: transactionSetting({
      enableAtomicCommit: Bind.static(true),
      enableAutoRun: Bind.static(true),
    }),
  };
}

export const microLiveopsSerialCodeDemo = definePackage(DEMO_PACKAGE_ID, "0.0.0")
  .display({
    label: { ja: "シリアルコード（デモデータ）", en: "Serial Codes (demo data)" },
    description: {
      ja: "ライブデモ用に、キャンペーンコード 1 つと、それを 1 人 1 回だけ引き換えてコインを受け取る操作を提供します。報酬は通貨パッケージのウォレットへ入ります。",
      en: "Supplies the live demo's one campaign code and the redemption that pays coins for it, once per visitor. The coins land in the currency package's wallet.",
    },
  })
  .displayType(SerialCodeRedemption, {
    label: { ja: "コードの引き換え", en: "Code redemption" },
    description: {
      ja: "シリアルコードの引き換えと、その回数制限です。",
      en: "Redeeming a serial code, and the limit on how often.",
    },
  })
  .dependency(serialCode.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the wallet and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .domainType(SerialCodeRedemption)

  .actionTransform(CountRedemptionTransform, actionTransform =>
    actionTransform.category("consume").output("Gs2Limit:CountUpByUserId", output =>
      output
        .resourceRef(() => RedemptionLimitModel)
        .mapResourceKey("namespaceName")
        // Supply the mounted row identity explicitly because namespace resource keys do not include the limit name.
        .mapStatic("limitName", REDEMPTION)
        .mapStatic("counterName", REDEMPTION_COUNTER)
        .mapPlaceholder("userId", "#{userId}")
        .mapStatic("countUpValue", 1)
        .mapStatic("maxValue", REDEMPTIONS_PER_VISITOR)
    )
  )

  .actionTransform(ClearRedemptionTransform, actionTransform =>
    actionTransform.category("acquire").output("Gs2Limit:DeleteCounterByUserId", output =>
      output
        .resourceRef(() => RedemptionLimitModel)
        .mapResourceKey("namespaceName")
        .mapStatic("limitName", REDEMPTION)
        .mapStatic("counterName", REDEMPTION_COUNTER)
        .mapPlaceholder("userId", "#{userId}")
    )
  )

  .instance(SerialCodeCampaign, CAMPAIGN_CODE, {
    [serialCode.propertyId("SerialCodeCampaign", "enableCampaignCode")]: true,
  })
  .instance(SerialCodeRedemption, REDEMPTION, {})

  .masterDataResource(resource =>
    resource
      .model(GS2.limit.Namespace)
      .bindings({
        name: Bind.static("SerialCodeLimit"),
        ...Bind.nulls("countUpScript", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(RedemptionLimitModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(redemptionExchange("SerialCodeRedeem"))
      .addChild(RedeemRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(redemptionExchange("SerialCodeStartOver"))
      .addChild(StartOverRateModel)
  )

  .uiComponent(SerialCodeRedemption, ui =>
    ui.templateLabel(
      "RuleLabel",
      `Type the campaign code ${CAMPAIGN_CODE} and redeem it for ${REWARD_COINS} coins. Each visitor can redeem it once; Start over clears your redemption so you can try again. Codes are case sensitive, and a wrong one is refused.`,
      {},
      { name: "SerialCodeRedemption" }
    )
  )
  .build();
