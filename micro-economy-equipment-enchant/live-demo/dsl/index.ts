/**
 * Live demo content for `micro-economy-equipment-enchant`.
 *
 * A piece of equipment rolls a handful of random bonuses the first time it is
 * read, and keeps them. What is worth watching is the list under each piece:
 * Reroll draws the same number of bonuses again, Add bonus draws one more, and
 * both take coins from the wallet on the same press.
 *
 * The feature package is the enchantment pool and the presses GS2 offers; it
 * ships no pool and nothing a player presses. This package adds one pool
 * ("standard": at most three bonuses, six options to draw from) and two
 * presses on every piece of equipment. GS2-Enchant has no client action that
 * rerolls or adds, so each press is an exchange whose only acquire action is
 * the package's own transform, run and committed server-side. The piece is
 * named by its item set (`propertyId`), which the press passes as the rate's
 * `#{propertyId}` config.
 *
 * The equipment list takes the pool as a scope: the list of pieces and the
 * bonuses under them are read against one pool, so the page names "standard".
 *
 * The equipment catalog, the wallet and its deposits are other packages' and
 * are installed beside this one rather than written out again: their rows
 * live in stacks every demo holding them deploys, and a second author of them
 * would be a second version, and the last deploy would win.
 */

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

import enchantSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import equipmentSurface from "../../../foundation-economy-equipment/dsl/dependency-surface.json";

const enchant = dependencyPackage(enchantSurface);
const equipment = dependencyPackage(equipmentSurface);
const currency = dependencyPackage(currencySurface);

const Equipment = equipment.type("Equipment");
const EquipmentEnchant = enchant.type("EquipmentEnchant");
const EquipmentEnchantSlotChance = enchant.type("EquipmentEnchantSlotChance");
const EquipmentEnchantOption = enchant.type("EquipmentEnchantOption");

const PROPERTY_ID = equipment.propertyId("Equipment", "propertyId");
const MAXIMUM_PARAMETER_COUNT = enchant.propertyId("EquipmentEnchant", "maximumParameterCount");

/** The one pool the page reads and the presses draw from. */
const STANDARD = "standard";
/** The demo shows one player with one wallet. */
const WALLET_SLOT = 0;
const REROLL_COST = 10;
const ADD_BONUS_COST = 30;

/** How likely a fresh piece is to roll exactly `count` bonuses. */
function slotChance(count: number, weight: number) {
  return {
    [enchant.propertyId("EquipmentEnchantSlotChance", "enchant")]: STANDARD,
    [enchant.propertyId("EquipmentEnchantSlotChance", "count")]: count,
    [enchant.propertyId("EquipmentEnchantSlotChance", "weight")]: weight,
  };
}

/**
 * One bonus the pool can roll. Every option names a different stat, so a
 * piece never shows the same stat twice: GS2 draws distinct options, not
 * distinct stats.
 */
function option(resourceName: string, resourceValue: number, weight: number) {
  return {
    [enchant.propertyId("EquipmentEnchantOption", "enchant")]: STANDARD,
    [enchant.propertyId("EquipmentEnchantOption", "resourceName")]: resourceName,
    [enchant.propertyId("EquipmentEnchantOption", "resourceValue")]: resourceValue,
    [enchant.propertyId("EquipmentEnchantOption", "weight")]: weight,
  };
}

/**
 * Runs `transformName` on the piece it is mounted on, for `cost` coins. Named
 * after the piece, because a delegated action on `Equipment` must target a
 * resource that mounts it. The piece's item set is only known at press time,
 * so the rate carries a `#{propertyId}` placeholder and the press fills it.
 * One bonus per press: GS2 refuses a second change to the same status in one
 * transaction.
 */
function enchantRateModel(
  transformName: "RerollEquipmentEnchantment" | "AddEquipmentEnchantmentSlot",
  cost: number
) {
  const count = transformName === "AddEquipmentEnchantmentSlot" ? [Arg.static("count", 1)] : [];
  return defineMasterDataResource(resource =>
    resource
      .model(GS2.exchange.RateModel)
      .mountLocal(Equipment)
      .bindings({ name: Bind.domainProperty(Source.direct(Equipment, "id")) })
      .addArrayChild("acquireActions", acquireAction => {
        acquireAction
          .model(GS2.transaction.AcquireAction)
          .mountLocal(Equipment)
          .bindings({
            action: Bind.transform(enchant.packageId, transformName, [
              Arg.static("enchant", STANDARD),
              Arg.placeholder("propertyId", "#{propertyId}"),
              ...count,
            ]),
          });
      })
      .addArrayChild("consumeActions", consumeAction => {
        consumeAction
          .model(GS2.transaction.ConsumeAction)
          .mountLocal(Equipment)
          .bindings({
            action: Bind.transform(currency.packageId, "WithdrawCurrency", [
              Arg.static("slot", WALLET_SLOT),
              Arg.static("paidOnly", false),
              Arg.static("count", cost),
            ]),
          });
      })
  );
}

const RerollRateModel = enchantRateModel("RerollEquipmentEnchantment", REROLL_COST);
const AddBonusRateModel = enchantRateModel("AddEquipmentEnchantmentSlot", ADD_BONUS_COST);

/**
 * An exchange namespace that runs and commits server-side, like every demo
 * press. Atomic, so a refused bonus (the piece already holds the most it can)
 * takes no coins. Each rate gets its own: both rates are named after the
 * pieces, and sharing a namespace collides the `rateModels` array on its
 * primary key.
 */
function exchangeNamespaceBindings(name: string) {
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

/** Fills a rate's `#{propertyId}` placeholder with the pressed piece's. */
const PROPERTY_ID_CONFIG = {
  kind: "listEntries",
  parameterName: "config",
  entries: [
    {
      kind: "fields",
      fields: [
        { name: "key", source: { kind: "static", value: "propertyId" } },
        { name: "value", source: { kind: "domainProperty", propertyName: PROPERTY_ID } },
      ],
    },
  ],
} as const;

export const microEconomyEquipmentEnchantDemo = definePackage(
  "micro-economy-equipment-enchant-demo",
  "0.0.0"
)
  .display({
    label: { ja: "装備エンチャント（デモデータ）", en: "Equipment Enchantment (demo data)" },
    description: {
      ja: "ライブデモ用のエンチャント設定と、効果の引き直し・追加の操作を提供します。",
      en: "Supplies the enchantment pool the live demo rolls from, and the presses that reroll a piece's bonuses or add one.",
    },
  })
  .dependency(enchant.packageId, "github:gs2io/gs2-studio-package")
  // The bonuses sit on a type the equipment package owns, and an install does
  // not walk a package's own dependencies, so the base package is named too.
  .dependency(equipment.packageId, "github:gs2io/gs2-studio-package")
  // The catalog a visitor takes pieces from.
  .dependency("foundation-economy-equipment-demo", "github:gs2io/gs2-studio-package")
  // The wallet the presses spend from, and the deposit that fills it.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  // The currency demo depends on the shop; installed so its stack matches.
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .instance(EquipmentEnchant, STANDARD, { [MAXIMUM_PARAMETER_COUNT]: 3 })
  // Mostly one bonus, sometimes two, rarely three.
  .instance(EquipmentEnchantSlotChance, "one", slotChance(1, 50))
  .instance(EquipmentEnchantSlotChance, "two", slotChance(2, 35))
  .instance(EquipmentEnchantSlotChance, "three", slotChance(3, 15))
  .instance(EquipmentEnchantOption, "attack", option("attack", 12, 25))
  .instance(EquipmentEnchantOption, "defense", option("defense", 10, 25))
  .instance(EquipmentEnchantOption, "hp", option("hp", 50, 20))
  .instance(EquipmentEnchantOption, "speed", option("speed", 4, 15))
  .instance(EquipmentEnchantOption, "critical", option("critical", 5, 10))
  .instance(EquipmentEnchantOption, "luck", option("luck", 3, 5))

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(exchangeNamespaceBindings("EquipmentEnchantReroll"))
      .addChild(RerollRateModel)
  )
  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings(exchangeNamespaceBindings("EquipmentEnchantAdd"))
      .addChild(AddBonusRateModel)
  )

  .uiComponent(EquipmentEnchant, ui =>
    ui.templateLabel(
      "RuleLabel",
      "A piece rolls 1 to {maximum} bonuses when it is first read. Reroll draws the same number again for 10 coins. Add bonus draws one more for 30 coins, up to {maximum}.",
      { maximum: ui.inheritedProp(MAXIMUM_PARAMETER_COUNT) },
      { name: "EquipmentEnchant" }
    )
  )
  // Add bonus is not greyed out at the maximum: the count lives in the rolled
  // list, which a condition cannot count. GS2 refuses the press and, the
  // namespace being atomic, takes no coins.
  .uiComponent(Equipment, ui =>
    ui
      .buttonAction("RerollButton", "Reroll", undefined, { name: "Equipment" })
      .buttonAction("AddBonusButton", "AddBonus", undefined, { name: "Equipment" })
  )

  .delegatedAction(Equipment, "Reroll", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: RerollRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .delegatedAction(Equipment, "AddBonus", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: AddBonusRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }, PROPERTY_ID_CONFIG],
  })
  .build();
