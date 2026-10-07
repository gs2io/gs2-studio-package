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

const STANDARD = "standard";
const WALLET_SLOT = 0;
const REROLL_COST = 10;
const ADD_BONUS_COST = 30;

function slotChance(count: number, weight: number) {
  return {
    [enchant.propertyId("EquipmentEnchantSlotChance", "enchant")]: STANDARD,
    [enchant.propertyId("EquipmentEnchantSlotChance", "count")]: count,
    [enchant.propertyId("EquipmentEnchantSlotChance", "weight")]: weight,
  };
}

function option(resourceName: string, resourceValue: number, weight: number) {
  return {
    [enchant.propertyId("EquipmentEnchantOption", "enchant")]: STANDARD,
    [enchant.propertyId("EquipmentEnchantOption", "resourceName")]: resourceName,
    [enchant.propertyId("EquipmentEnchantOption", "resourceValue")]: resourceValue,
    [enchant.propertyId("EquipmentEnchantOption", "weight")]: weight,
  };
}

/** Supply the owned item-set id at click time because it does not exist when the rate is deployed. */
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

/** Separate namespaces to avoid duplicate equipment-derived rate names. Commit each purchase atomically so a refused enchantment cannot spend coins alone. */
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
  .dependency(equipment.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared equipment catalog so demos cannot deploy different versions of the same stack.
  .dependency("foundation-economy-equipment-demo", "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so the wallet, deposits and store products stay identical across demos.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")

  .instance(EquipmentEnchant, STANDARD, { [MAXIMUM_PARAMETER_COUNT]: 3 })
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
      `A piece rolls 1 to {maximum} bonuses when it is first read. Reroll draws the same number again for ${REROLL_COST} coins. Add bonus draws one more for ${ADD_BONUS_COST} coins, up to {maximum}.`,
      { maximum: ui.inheritedProp(MAXIMUM_PARAMETER_COUNT) },
      { name: "EquipmentEnchant" }
    )
  )
  // The bonus count lives in a nested list that this row condition cannot count; let the atomic exchange reject an invalid purchase.
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
