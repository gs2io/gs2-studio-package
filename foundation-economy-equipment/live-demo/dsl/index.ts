import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import equipmentSurface from "../../dsl/dependency-surface.json";

const equipment = dependencyPackage(equipmentSurface);

const EquipmentCollection = equipment.type("EquipmentCollection");

const EquipmentCategory = equipment.type("EquipmentCategory");

const Equipment = equipment.type("Equipment");

/** Give the catalog a separate model so its section and generated classes do not collide with the owned-equipment view. */
const EquipmentCatalog = defineDomainType("EquipmentCatalog", domainType =>
  domainType
    .property(
      PT.prop("equipment", PT.ref(equipment.typeId("Equipment")))
        .masterData()
        .required()
    )
    .localizedProperties({
      id: {
        ja: { label: "装備カタログ", description: "デモで装備を1つ入手します。" },
        en: { label: "Catalog", description: "Grants one piece of equipment in the demo." },
      },
      equipment: {
        ja: { label: "装備", description: "このカタログ行が付与する装備です。" },
        en: { label: "Equipment", description: "The equipment this catalog row grants." },
      },
    })
);

const DEFAULT_CAPACITY = 4;
const MAXIMUM_CAPACITY = 10;

const CAPACITY_STEP = 2;

const TakeRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(EquipmentCatalog)
    .bindings({ name: Bind.domainProperty(Source.direct(EquipmentCatalog, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(EquipmentCatalog)
        .bindings({
          action: Bind.transform(equipment.packageId, "AcquireEquipment", [
            Arg.domainProperty(
              "equipment",
              Source.parent(Source.direct(EquipmentCatalog, "equipment"))
            ),
          ]),
        });
    })
);

const DiscardRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Equipment)
    .bindings({ name: Bind.domainProperty(Source.direct(Equipment, "id")) })
    .addArrayChild("consumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(Equipment)
        .bindings({
          action: Bind.transform(equipment.packageId, "DeleteEquipment", [
            Arg.domainProperty("equipment", Source.direct(Equipment, "id")),
            // Omit instance selection because the deployed rate cannot name a future owned item set; discard consumes by equipment type.
          ]),
        });
    })
);

const ExpandRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(EquipmentCollection)
    .bindings({ name: Bind.domainProperty(Source.direct(EquipmentCollection, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(EquipmentCollection)
        .bindings({
          action: Bind.transform(equipment.packageId, "AddEquipmentCapacity", [
            Arg.static("value", CAPACITY_STEP),
          ]),
        });
    })
);

export const foundationEconomyEquipmentDemo = definePackage(
  "foundation-economy-equipment-demo",
  "0.0.0"
)
  .display({
    label: { ja: "装備（デモデータ）", en: "Equipment (demo data)" },
    description: {
      ja: "ライブデモ用の装備カタログと所持枠、入手・破棄・拡張の操作を提供します。",
      en: "Supplies the equipment catalog and bag used by the live demo, and the presses that take, discard and expand.",
    },
  })
  .dependency(equipment.packageId, "github:gs2io/gs2-studio-package")
  .domainType(EquipmentCatalog)

  .instance(EquipmentCategory, "weapon", {})
  .instance(EquipmentCategory, "armor", {})

  // Match the fixed single-entry identity so the generated handler requests the expand rate that was deployed.
  .instance(EquipmentCollection, "equipmentcollection", {
    [equipment.propertyId("EquipmentCollection", "defaultCapacity")]: DEFAULT_CAPACITY,
    [equipment.propertyId("EquipmentCollection", "maximumCapacity")]: MAXIMUM_CAPACITY,
  })

  .instance(Equipment, "iron-sword", {
    [equipment.propertyId("Equipment", "category")]: "weapon",
    [equipment.propertyId("Equipment", "sortValue")]: 100,
  })
  .instance(Equipment, "oak-staff", {
    [equipment.propertyId("Equipment", "category")]: "weapon",
    [equipment.propertyId("Equipment", "sortValue")]: 200,
  })
  .instance(Equipment, "steel-shield", {
    [equipment.propertyId("Equipment", "category")]: "armor",
    [equipment.propertyId("Equipment", "sortValue")]: 300,
  })

  .instance("EquipmentCatalog", "iron-sword", { equipment: "iron-sword" })
  .instance("EquipmentCatalog", "oak-staff", { equipment: "oak-staff" })
  .instance("EquipmentCatalog", "steel-shield", { equipment: "steel-shield" })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EquipmentTake"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the grant without requiring a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(TakeRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EquipmentDiscard"),
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
      .addChild(DiscardRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("EquipmentExpand"),
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
      .addChild(ExpandRateModel)
  )

  .uiComponent(EquipmentCatalog, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "EquipmentCatalog" })
      .buttonAction("TakeButton", "Take", undefined, { name: "EquipmentCatalog" })
  )

  .uiComponent(Equipment, ui =>
    ui.buttonAction("DiscardButton", "Discard", undefined, { name: "Equipment" })
  )

  // Keep the empty-state hint on the collection because an empty bag has no row on which to display it.
  .uiComponent(EquipmentCollection, ui =>
    ui
      .buttonAction("ExpandButton", "Expand", undefined, { name: "EquipmentCollection" })
      .label("NoneYetLabel", ui.lit("Take a piece of equipment above to start."), {
        name: "EquipmentCollection",
      })
      .activeToggle("HoldsAnyActiveToggle", UiCond.gt(ui.prop("currentCapacityUsage"), ui.lit(0)), {
        name: "EquipmentCollection",
      })
  )

  .delegatedAction(EquipmentCatalog, "Take", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: TakeRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(Equipment, "Discard", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: DiscardRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(EquipmentCollection, "Expand", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: ExpandRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
