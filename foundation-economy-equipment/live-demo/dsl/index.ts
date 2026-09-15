/**
 * Live demo content for `foundation-economy-equipment`.
 *
 * The feature package models a bag and the equipment that goes in it, but
 * ships neither — what a title sells and how big a bag it gives are a title's
 * decisions. This package supplies a small catalogue, a bag to put it in, and
 * the three presses that move them: take one, throw one away, and buy room
 * for more.
 *
 * The catalogue and the bag are the same model read from two places, so they
 * are two overlays of it: one listed from the master data a title authored,
 * one from what a player actually holds. Seeing both at once is the point —
 * one sword in the catalogue becomes as many rows in the bag as the player
 * has taken.
 */

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
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import equipmentSurface from "../../dsl/dependency-surface.json";

const equipment = dependencyPackage(equipmentSurface);

/** The bag: how many slots are in use, and how many there are. */
const EquipmentCollection = equipment.type("EquipmentCollection");

const EquipmentCategory = equipment.type("EquipmentCategory");

/** What a player holds: one row per piece, listed from their own data. */
const Equipment = equipment.type("Equipment");

/**
 * One piece of equipment a visitor can take. The catalogue is not a second
 * overlay of `Equipment`: a page draws one section per model and generates one
 * set of classes per model, so two views of one model collide. A row that
 * names the equipment it grants is a model of its own, and it is also what the
 * exchange hands to `AcquireEquipment`.
 */
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
        en: { label: "Catalogue", description: "Grants one piece of equipment in the demo." },
      },
      equipment: {
        ja: { label: "装備", description: "このカタログ行が付与する装備です。" },
        en: { label: "Equipment", description: "The equipment this catalogue row grants." },
      },
    })
);

/** Four slots to start with, ten once a player has paid for the room. */
const DEFAULT_CAPACITY = 4;
const MAXIMUM_CAPACITY = 10;

/** One press buys two slots, so the ceiling is three presses away. */
const CAPACITY_STEP = 2;

/** Taking a piece of equipment: an exchange that costs nothing. */
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

/**
 * Throwing one away. It names the instance as well as the equipment, because
 * two of the same sword are two rows and a player means the one they pressed.
 */
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
            // Which of the player's copies to throw away is not something a
            // rate model can know: it is master data, fixed at deploy time,
            // and the instance only exists once a player owns it. Left unset,
            // GS2 takes one from whichever stack it likes — which is the whole
            // of "discard one" as far as the demo is concerned.
            Arg.static("equipmentPropertyId", null),
          ]),
        });
    })
);

/** Buying room for more. */
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
      en: "Supplies the equipment catalogue and bag used by the live demo, and the presses that take, discard and expand.",
    },
  })
  .dependency(equipment.packageId, "github:gs2io/gs2-studio-package")
  .domainType(EquipmentCatalog)

  .instance(EquipmentCategory, "weapon", {})
  .instance(EquipmentCategory, "armor", {})

  // A single-entry type's row id is not free: the generated handler mounts it
  // as the lowercased type name, so anything built from the row's `id` — the
  // expand rate is named that way — has to agree or the runtime asks for a
  // name that was never deployed.
  .instance(EquipmentCollection, "equipmentcollection", {
    [equipment.propertyId("EquipmentCollection", "defaultCapacity")]: DEFAULT_CAPACITY,
    [equipment.propertyId("EquipmentCollection", "maximumCapacity")]: MAXIMUM_CAPACITY,
  })

  // Three pieces rather than one: a catalogue is a list, and the bag beside it
  // only reads as a bag when it holds more than one kind of thing. Sort values
  // are spaced so a title could slot something between them.
  // The equipment itself, which the feature package's `ItemModel` turns into
  // the catalogue GS2 holds. Sort values are spaced so a title could slot
  // something between them.
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

  // One catalogue row per piece: what a visitor presses to take it.
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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave a slot spent but not filled if the page is closed
        // mid-way.
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

  // The catalogue is its own model, so it needs its own name to show; the bag
  // and the readings on it come from the feature package.
  .uiComponent(EquipmentCatalog, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "EquipmentCatalog" })
      .buttonAction("TakeButton", "Take", undefined, { name: "EquipmentCatalog" })
  )

  .uiComponent(Equipment, ui =>
    ui.buttonAction("DiscardButton", "Discard", undefined, { name: "Equipment" })
  )

  .uiComponent(EquipmentCollection, ui =>
    ui.buttonAction("ExpandButton", "Expand", undefined, { name: "EquipmentCollection" })
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
