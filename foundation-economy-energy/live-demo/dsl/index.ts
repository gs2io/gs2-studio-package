import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import energySurface from "../../dsl/dependency-surface.json";

const energy = dependencyPackage(energySurface);

const Energy = energy.type("Energy");

const DEFAULT_MAXIMUM = 50;

/** Allow purchases above the normal capacity so a refill bought while full is not immediately discarded. */
const OVERFLOW_MAXIMUM = 100;

/** Use a short recovery interval so visitors can observe passive recovery during a demo session. */
const RECOVERY_INTERVAL_MINUTES = 1;

/** Use the same amount for recovery ticks and manual recovery so the button demonstrates skipping one wait. */
const RECOVERY_VALUE = 5;

const CONSUME_VALUE = 10;

/** Keep spend and recovery in separate namespaces because both rates derive the same name from Energy. */
const ConsumeRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Energy)
    .bindings({ name: Bind.domainProperty(Source.direct(Energy, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(Energy)
        .bindings({
          action: Bind.transform(energy.packageId, "ConsumeEnergy", [
            Arg.domainProperty("energy", Source.direct(Energy, "id")),
            Arg.static("value", CONSUME_VALUE),
          ]),
        });
    })
);

const RecoverRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Energy)
    .bindings({ name: Bind.domainProperty(Source.direct(Energy, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Energy)
        .bindings({
          action: Bind.transform(energy.packageId, "RecoveryEnergy", [
            Arg.domainProperty("energy", Source.direct(Energy, "id")),
            Arg.static("value", RECOVERY_VALUE),
          ]),
        });
    })
);

export const foundationEconomyEnergyDemo = definePackage("foundation-economy-energy-demo", "0.0.0")
  .display({
    label: { ja: "スタミナ（デモデータ）", en: "Stamina (demo data)" },
    description: {
      ja: "ライブデモ用のスタミナ設定と、消費・回復の操作を提供します。",
      en: "Supplies the stamina settings used by the live demo, and the spend and recover presses.",
    },
  })
  .dependency(energy.packageId, "github:gs2io/gs2-studio-package")

  .instance(Energy, "stamina", {
    [energy.propertyId("Energy", "defaultMaximum")]: DEFAULT_MAXIMUM,
    [energy.propertyId("Energy", "useOverflow")]: true,
    [energy.propertyId("Energy", "overflowedMaximum")]: OVERFLOW_MAXIMUM,
    [energy.propertyId("Energy", "recoveryIntervalMinutes")]: RECOVERY_INTERVAL_MINUTES,
    [energy.propertyId("Energy", "recoveryValue")]: RECOVERY_VALUE,
  })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EnergyConsume"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the exchange transaction without a second client request.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(ConsumeRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EnergyRecover"),
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
      })
      .addChild(RecoverRateModel)
  )

  .uiComponent(Energy, ui =>
    ui
      .buttonAction("SpendButton", "Spend", undefined, { name: "Energy" })
      .buttonAction("RecoverButton", "Recover", undefined, { name: "Energy" })
  )

  .delegatedAction(Energy, "Spend", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ConsumeRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Energy, "Recover", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: RecoverRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
