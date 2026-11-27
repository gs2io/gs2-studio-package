import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import { GS2 } from "gs2-studio-dsl/gs2";

import equipmentSurface from "../../dsl/dependency-surface.json";

const equipment = dependencyPackage(equipmentSurface);

const EquipmentCollection = equipment.type("EquipmentCollection");

const EquipmentCategory = equipment.type("EquipmentCategory");

const Equipment = equipment.type("Equipment");

const EquipmentCatalog = defineDomainType("EquipmentCatalog", {
  properties: {
    equipment: PT.ref(equipment.type("Equipment")).masterData().required(),
  },
  localizedProperties: {
      id: {
        ja: { label: "装備カタログ", description: "デモで装備を1つ入手します。" },
        en: { label: "Catalog", description: "Grants one piece of equipment in the demo." },
      },
      equipment: {
        ja: { label: "装備", description: "このカタログ行が付与する装備です。" },
        en: { label: "Equipment", description: "The equipment this catalog row grants." },
      },
    },
});

const DEFAULT_CAPACITY = 4;

const MAXIMUM_CAPACITY = 10;

const CAPACITY_STEP = 2;

const TakeRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: EquipmentCatalog,
  bindings: { name: Bind.domainProperty(Source.direct(EquipmentCatalog, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: EquipmentCatalog,
  actionProgram: ActionProgram.transform(equipment.packageId, equipment.transformId("AcquireEquipment"), [
            Arg.domainProperty(
              "equipment",
              Source.parent(Source.direct(EquipmentCatalog, "equipment"))
            ),
          ]),
}),
    ],
  },
});

const DiscardRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Equipment,
  bindings: { name: Bind.domainProperty(Source.direct(Equipment, "id")) },
  arrayChildren: {
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Equipment,
  actionProgram: ActionProgram.transform(equipment.packageId, equipment.transformId("DeleteEquipment"), [
            Arg.domainProperty("equipment", Source.direct(Equipment, "id")),
            // Omit instance selection because the deployed rate cannot name a future owned item set; discard consumes by equipment type.
          ]),
}),
    ],
  },
});

const ExpandRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: EquipmentCollection,
  bindings: { name: Bind.domainProperty(Source.direct(EquipmentCollection, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: EquipmentCollection,
  actionProgram: ActionProgram.transform(
            equipment.packageId,
            equipment.transformId("AddEquipmentCapacity"),
            [Arg.static("value", CAPACITY_STEP)]
          ),
}),
    ],
  },
});

export const foundationEconomyEquipmentDemo = definePackage({
  id: "foundation-economy-equipment-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備（デモデータ）",
      description: "ライブデモ用の装備カタログと所持枠、入手・破棄・拡張の操作を提供します。",
    },
    en: {
      label: "Equipment (demo data)",
      description:
        "Supplies the equipment catalog and bag used by the live demo, and the presses that take, discard and expand.",
    },
  },
  dependencies: liveDemoDependencies(equipment.packageId),
  domainTypes: [EquipmentCatalog],
  instances: [
    instance(EquipmentCategory, "weapon", {}),
    instance(EquipmentCategory, "armor", {}),
    instance(EquipmentCollection, "equipmentcollection", {
    [equipment.propertyId("EquipmentCollection", "defaultCapacity")]: DEFAULT_CAPACITY,
    [equipment.propertyId("EquipmentCollection", "maximumCapacity")]: MAXIMUM_CAPACITY,
  }),
    instance(Equipment, "iron-sword", {
    [equipment.propertyId("Equipment", "category")]: "weapon",
    [equipment.propertyId("Equipment", "sortValue")]: 100,
  }),
    instance(Equipment, "oak-staff", {
    [equipment.propertyId("Equipment", "category")]: "weapon",
    [equipment.propertyId("Equipment", "sortValue")]: 200,
  }),
    instance(Equipment, "steel-shield", {
    [equipment.propertyId("Equipment", "category")]: "armor",
    [equipment.propertyId("Equipment", "sortValue")]: 300,
  }),
    instance(EquipmentCatalog, "iron-sword", { equipment: "iron-sword" }),
    instance(EquipmentCatalog, "oak-staff", { equipment: "oak-staff" }),
    instance(EquipmentCatalog, "steel-shield", { equipment: "steel-shield" }),
  ],
  delegatedActions: [
    { target: EquipmentCatalog, methodName: "Take", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: TakeRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: Equipment, methodName: "Discard", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: DiscardRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: EquipmentCollection, methodName: "Expand", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: ExpandRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EquipmentTake"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the grant without requiring a second client request after the exchange.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    TakeRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EquipmentDiscard"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    DiscardRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("EquipmentExpand"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    ExpandRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(EquipmentCatalog, {
  items: [
    UiItem.templateLabel("NameLabel", "{id}", { id: UiSource.prop("id") }, { name: "EquipmentCatalog" }),
    UiItem.buttonAction("TakeButton", "Take", undefined, { name: "EquipmentCatalog" }),
  ],
}),
    defineUiComponent(Equipment, {
  items: [
    UiItem.buttonAction("DiscardButton", "Discard", undefined, { name: "Equipment" }),
  ],
}),
    defineUiComponent(EquipmentCollection, {
  items: [
    UiItem.buttonAction("ExpandButton", "Expand", undefined, { name: "EquipmentCollection" }),
    UiItem.label("NoneYetLabel", UiSource.lit("Take a piece of equipment above to start."), {
        name: "EquipmentCollection",
      }),
    UiItem.activeToggle("HoldsAnyActiveToggle", UiCond.gt(UiSource.prop("currentCapacityUsage"), UiSource.lit(0)), {
        name: "EquipmentCollection",
      }),
  ],
}),
  ],
});
