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
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

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

function enchantRateModel(
  transformName: "RerollEquipmentEnchantment" | "AddEquipmentEnchantmentSlot",
  cost: number
) {
  const count = transformName === "AddEquipmentEnchantmentSlot" ? [Arg.static("count", 1)] : [];
  return defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Equipment,
  bindings: { name: Bind.domainProperty(Source.direct(Equipment, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Equipment,
  actionProgram: ActionProgram.transform(enchant.packageId, enchant.transformId(transformName), [
              Arg.static("enchant", STANDARD),
              Arg.placeholder("propertyId", "#{propertyId}"),
              ...count,
            ]),
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Equipment,
  actionProgram: ActionProgram.transform(currency.packageId, currency.transformId("WithdrawCurrency"), [
              Arg.static("slot", WALLET_SLOT),
              Arg.static("paidOnly", false),
              Arg.static("count", cost),
            ]),
}),
    ],
  },
});
}

const RerollRateModel = enchantRateModel("RerollEquipmentEnchantment", REROLL_COST);

const AddBonusRateModel = enchantRateModel("AddEquipmentEnchantmentSlot", ADD_BONUS_COST);

function exchangeNamespaceBindings(name: string) {
  return {
    name: Bind.static(name),
    ...Bind.nulls(
      "acquireAwaitScript",
      "exchangeScript",
      "incrementalExchangeScript",
      "logSetting"
    ),
    transactionSettingV2: transactionSettingV2(),
  };
}

const PROPERTY_ID_CONFIG = {
  parameterName: "config",
  source: {
    kind: "listEntries",

    entries: [
      {
        kind: "fields",
        fields: [
          { name: "key", source: { kind: "static", value: "propertyId" } },
          { name: "value", source: { kind: "domainProperty", propertyName: PROPERTY_ID } },
        ],
      },
    ],
  },
} as const;

export const microEconomyEquipmentEnchantDemo = definePackage({
  id: "micro-economy-equipment-enchant-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備エンチャント（デモデータ）",
      description: "ライブデモ用のエンチャント設定と、効果の引き直し・追加の操作を提供します。",
    },
    en: {
      label: "Equipment Enchantment (demo data)",
      description:
        "Supplies the enchantment pool the live demo rolls from, and the presses that reroll a piece's bonuses or add one.",
    },
  },
  dependencies: liveDemoDependencies(
    enchant.packageId,
    equipment.packageId,
    "foundation-economy-equipment-demo",
    currency.packageId,
    "foundation-economy-currency-demo",
    "micro-shop-currency"
  ),
  instances: [
    instance(EquipmentEnchant, STANDARD, { [MAXIMUM_PARAMETER_COUNT]: 3 }),
    instance(EquipmentEnchantSlotChance, "one", slotChance(1, 50)),
    instance(EquipmentEnchantSlotChance, "two", slotChance(2, 35)),
    instance(EquipmentEnchantSlotChance, "three", slotChance(3, 15)),
    instance(EquipmentEnchantOption, "attack", option("attack", 12, 25)),
    instance(EquipmentEnchantOption, "defense", option("defense", 10, 25)),
    instance(EquipmentEnchantOption, "hp", option("hp", 50, 20)),
    instance(EquipmentEnchantOption, "speed", option("speed", 4, 15)),
    instance(EquipmentEnchantOption, "critical", option("critical", 5, 10)),
    instance(EquipmentEnchantOption, "luck", option("luck", 3, 5)),
  ],
  delegatedActions: [
    { target: Equipment, methodName: "Reroll", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: RerollRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
    { target: Equipment, methodName: "AddBonus", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: AddBonusRateModel, parameterOverrides: [
      { parameterName: "count", source: { kind: "static", value: 1 } },
      PROPERTY_ID_CONFIG,
    ] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: exchangeNamespaceBindings("EquipmentEnchantReroll"),
  children: [
    RerollRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: exchangeNamespaceBindings("EquipmentEnchantAdd"),
  children: [
    AddBonusRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(EquipmentEnchant, {
  items: [
    UiItem.templateLabel("RuleLabel", `A piece rolls 1 to {maximum} bonuses when it is first read. Reroll draws the same number again for ${REROLL_COST} coins. Add bonus draws one more for ${ADD_BONUS_COST} coins, up to {maximum}.`, { maximum: UiSource.inheritedProp(MAXIMUM_PARAMETER_COUNT) }, { name: "EquipmentEnchant" }),
  ],
}),
    defineUiComponent(Equipment, {
  items: [
    UiItem.buttonAction("RerollButton", "Reroll", undefined, { name: "Equipment" }),
    UiItem.buttonAction("AddBonusButton", "AddBonus", undefined, { name: "Equipment" }),
  ],
}),
  ],
});
