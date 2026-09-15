/**
 * Live demo content for `foundation-economy-energy`.
 *
 * The feature package defines the stamina model but ships no rows — a title
 * supplies its own capacity and recovery curve. Stamina is also a meter rather
 * than something a visitor collects, so a page that only read it would sit
 * still for the first minute and then tick once. This package supplies one
 * stamina model to read, and the two presses that move it: spend some, put
 * some back.
 */

import {
  Arg,
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import energySurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const energy = dependencyPackage(energySurface);

const Energy = defineOverlayDomainType(
  "Energy",
  energy.overlay("Energy"),
  domainType => domainType
);

/** Capacity a visitor starts with, and what the gauge measures against. */
const DEFAULT_MAXIMUM = 50;

/**
 * Overflow stays off: with it on the meter can hold more than its own maximum,
 * and a gauge whose value sits past its ceiling reads as broken rather than as
 * a feature. The field is still required and GS2 wants a ceiling no lower than
 * the starting capacity, so it records the headroom overflow would have had.
 */
const OVERFLOW_MAXIMUM = 100;

/**
 * The shortest interval GS2 accepts. A demo that recovered hourly would look
 * identical to one that recovered never, so the passive tick has to land while
 * the visitor is still on the page.
 */
const RECOVERY_INTERVAL_MINUTES = 1;

/**
 * Stamina restored by one automatic tick, and by one press of Recover — a
 * tenth of the meter, so the bar visibly moves. Pressing the button is
 * therefore exactly "skip the wait", which is the relationship between the two
 * halves of the demo.
 */
const RECOVERY_VALUE = 5;

/** One press spends a fifth of a full meter: five presses empty it. */
const CONSUME_VALUE = 10;

/**
 * Spending stamina, modelled as an exchange that grants nothing: the consume
 * action is the whole of the press.
 *
 * The rate is named after the stamina model because a delegated action on
 * `Energy` must target a resource that mounts `Energy` — that is how the
 * generated loader learns which rate to exchange.
 *
 * It lives under its own exchange namespace because `RecoverRateModel` names
 * its rows the same way; sharing a namespace collides the `rateModels` array
 * on its primary key and drops the whole `CurrentRateMaster` from the template.
 */
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
            Arg.static("value", CONSUME_VALUE),
          ]),
        });
    })
);

/** The mirror of `ConsumeRateModel`: costs nothing and puts one tick back. */
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
  .domainType(Energy)

  .instance("Energy", "stamina", {
    [energy.propertyId("Energy", "defaultMaximum")]: DEFAULT_MAXIMUM,
    [energy.propertyId("Energy", "useOverflow")]: false,
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave the meter spent but not refilled if the page is
        // closed mid-way.
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

  // Everything the visitor sees hangs off the one stamina model: the bar, the
  // numbers beside it and both buttons. They are generated components a scene
  // wires in the Inspector, which is the point of the demo — nothing here
  // needs a script of its own.
  //
  // Every property is inherited from the feature package, so each is addressed
  // by the id the dependency published: a single-package build cannot see an
  // overlay's inherited names.
  .uiComponent(Energy, ui =>
    ui
      // The ceiling is the player's own `currentMaximumValue`, not a number
      // read out of a table: GS2 can raise a player's capacity, and a gauge
      // measured against the authored default would then stop short of full.
      .gauge(
        "StaminaGauge",
        ui.inheritedProp(energy.propertyId("Energy", "currentValue")),
        ui.inheritedProp(energy.propertyId("Energy", "currentMaximumValue")),
        { name: "Energy", clamp: true }
      )
      .templateLabel(
        "StaminaLabel",
        "{currentValue}/{currentMaximumValue}",
        {
          currentValue: ui.inheritedProp(energy.propertyId("Energy", "currentValue")),
          currentMaximumValue: ui.inheritedProp(energy.propertyId("Energy", "currentMaximumValue")),
        },
        { name: "Energy" }
      )
      // The recovery clock, handed to the scene as a `DateTime` rather than as
      // text: how a countdown reads is the scene's business, and an epoch
      // printed raw is worse than nothing.
      .value("NextRecoveryValue", ui.inheritedProp(energy.propertyId("Energy", "nextRecoverdAt")), {
        name: "Energy",
      })
      .buttonAction("ConsumeButton", "Consume", undefined, { name: "Energy" })
      .buttonAction("RecoverButton", "Recover", undefined, { name: "Energy" })
  )

  .delegatedAction(Energy, "Consume", {
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
