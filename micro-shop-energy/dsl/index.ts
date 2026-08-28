import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const EnergyProduct = defineDomainType("EnergyProduct", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("recoveryValue").masterData().required())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
);

const RateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(EnergyProduct)
    .bindings({
      name: Bind.domainProperty(Source.direct(EnergyProduct, "id")),
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(EnergyProduct)
        .bindings({
          // The recovery amount is authored on the product and handed to the
          // energy package's own RecoveryEnergy transform.
          action: Bind.transform("foundation-economy-energy", "RecoveryEnergy", [
            {
              parameterName: "value",
              source: {
                kind: "domainProperty",
                source: Source.parent(Source.direct(EnergyProduct, "recoveryValue")),
              },
            },
          ]),
        });
    })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(EnergyProduct)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(EnergyProduct, "consumeActions"))
          ),
        });
    })
);

export const microShopEnergy = definePackage("micro-shop-energy", "0.0.0")
  .display({
    label: { ja: "スタミナショップ", en: "Stamina Shop" },
    description: {
      ja: "スタミナを回復する商品を販売するショップ機能です。",
      en: "A shop that sells products to refill stamina.",
    },
  })
  .displayType(EnergyProduct, {
    label: { ja: "スタミナ商品", en: "Stamina product" },
    description: {
      ja: "購入時に回復するスタミナ量、価格、購入制限を設定します。",
      en: "Defines a stamina product's recovery amount, price, and purchase limits.",
    },
  })
  .dependency("foundation-economy-energy", "github:gs2io/gs2-studio-package")
  .domainType(EnergyProduct)
  .masterDataResource(r =>
    r
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EnergyProduct"),
        acquireAwaitScript: Bind.null(),
        exchangeScript: Bind.null(),
        incrementalExchangeScript: Bind.null(),
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
      .addChild(RateModel)
  )
  .build();
