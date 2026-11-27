import {
  ActionProgram,
  Arg,
  Bind,
  defineMasterDataResource,
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

import energySurface from "../../dsl/dependency-surface.json";

const energy = dependencyPackage(energySurface);

const Energy = energy.type("Energy");

const DEFAULT_MAXIMUM = 50;

const OVERFLOW_MAXIMUM = 100;

const RECOVERY_INTERVAL_MINUTES = 1;

const RECOVERY_VALUE = 5;

const CONSUME_VALUE = 10;

const ConsumeRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Energy,
  bindings: { name: Bind.domainProperty(Source.direct(Energy, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Energy,
  actionProgram: ActionProgram.transform(energy.packageId, energy.transformId("ConsumeEnergy"), [
            Arg.domainProperty("energy", Source.direct(Energy, "id")),
            Arg.static("value", CONSUME_VALUE),
          ]),
}),
    ],
  },
});

const RecoverRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Energy,
  bindings: { name: Bind.domainProperty(Source.direct(Energy, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Energy,
  actionProgram: ActionProgram.transform(energy.packageId, energy.transformId("RecoveryEnergy"), [
            Arg.domainProperty("energy", Source.direct(Energy, "id")),
            Arg.static("value", RECOVERY_VALUE),
          ]),
}),
    ],
  },
});

export const foundationEconomyEnergyDemo = definePackage({
  id: "foundation-economy-energy-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "スタミナ（デモデータ）",
      description: "ライブデモ用のスタミナ設定と、消費・回復の操作を提供します。",
    },
    en: {
      label: "Stamina (demo data)",
      description:
        "Supplies the stamina settings used by the live demo, and the spend and recover presses.",
    },
  },
  dependencies: liveDemoDependencies(energy.packageId),
  instances: [
    instance(Energy, "stamina", {
    [energy.propertyId("Energy", "defaultMaximum")]: DEFAULT_MAXIMUM,
    [energy.propertyId("Energy", "useOverflow")]: true,
    [energy.propertyId("Energy", "overflowedMaximum")]: OVERFLOW_MAXIMUM,
    [energy.propertyId("Energy", "recoveryIntervalMinutes")]: RECOVERY_INTERVAL_MINUTES,
    [energy.propertyId("Energy", "recoveryValue")]: RECOVERY_VALUE,
  }),
  ],
  delegatedActions: [
    { target: Energy, methodName: "Spend", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ConsumeRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Energy, methodName: "Recover", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: RecoverRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EnergyConsume"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the exchange transaction without a second client request.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ConsumeRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EnergyRecover"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    RecoverRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(Energy, {
  items: [
    UiItem.buttonAction("SpendButton", "Spend", undefined, { name: "Energy" }),
    UiItem.buttonAction("RecoverButton", "Recover", undefined, { name: "Energy" }),
  ],
}),
  ],
});
