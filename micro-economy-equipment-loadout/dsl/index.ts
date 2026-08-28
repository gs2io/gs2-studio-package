import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** The character type and property this loadout hangs off. */
const CHARACTER_TYPE_ID = "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5";
const CHARACTER_PROPERTY_ID = "prop_37JJ37ED8GWPZH1A1H4P7DJ5KD";

/**
 * A slot on a character — weapon, armour, accessory. `propertyRegex` decides
 * what fits: it is matched against the property id of the thing being put in,
 * so a slot can accept one category of equipment and refuse the rest.
 */
const EquipmentSlot = defineDomainType("EquipmentSlot", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("propertyRegex")
        .masterData()
        .required()
        .description("Which equipment this slot accepts, matched on its property id")
    )
);

/** What one character currently has in one slot. */
const EquipmentSlotAssignment = defineDomainType("EquipmentSlotAssignment", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("equipment")
        .userData()
        .description("Property id of the equipment worn here, empty when the slot is free")
    )
);

/**
 * The character's loadout, added to the character package's own type. This is
 * the edge that was missing between characters and equipment: the equipment
 * package says what a player owns, and this says what a character wears.
 */
const Character = defineOverlayDomainType(
  "Character",
  {
    source: {
      kind: "dependency",
      directSourcePackageId: "foundation-economy-character",
      directSourceTypeId: CHARACTER_TYPE_ID,
      sourcePackageId: "foundation-economy-character",
      sourceTypeId: CHARACTER_TYPE_ID,
    },
  },
  domainType =>
    domainType.property(
      PT.prop("equipmentSlots", PT.listOf(PT.inline("EquipmentSlotAssignment"))).userData()
    )
);

const PropertyFormModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.formation.PropertyFormModel)
    .bindings({
      name: Bind.static("CharacterEquipment"),
      metadata: Bind.static(""),
    })
    .addArrayChild("slots", slotModel => {
      slotModel
        .model(GS2.formation.SlotModel)
        .mountLocal(EquipmentSlot)
        .bindings({
          name: Bind.domainProperty(Source.direct(EquipmentSlot, "id")),
          metadata: Bind.static(""),
          propertyRegex: Bind.domainProperty(Source.direct(EquipmentSlot, "propertyRegex")),
        });
    })
);

export const microEconomyEquipmentLoadout = definePackage(
  "micro-economy-equipment-loadout",
  "0.0.0"
)
  .display({
    label: { ja: "装備の装着", en: "Equipment Loadout" },
    description: {
      ja: "キャラクターごとの装備スロットを扱います。スロットごとに装着できる装備を制限できます。",
      en: "Gives each character its own equipment slots, with per-slot restrictions on what fits.",
    },
  })
  .displayType(EquipmentSlot, {
    label: { ja: "装備スロット", en: "Equipment slot" },
    description: {
      ja: "キャラクターの装備部位と装着できる装備カテゴリを設定します。",
      en: "Defines a character equipment slot and the equipment categories it accepts.",
    },
  })
  .displayType(EquipmentSlotAssignment, {
    label: { ja: "装着中の装備", en: "Worn equipment" },
    description: {
      ja: "各装備スロットに現在装着されている装備を管理します。",
      en: "Tracks the equipment currently assigned to each loadout slot.",
    },
  })
  .displayType(Character, {
    label: { ja: "キャラクター", en: "Character" },
    description: {
      ja: "キャラクターごとの装備スロット構成と装着状態を管理します。",
      en: "Manages each character's equipment slot layout and current loadout.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(EquipmentSlot)
  .domainType(EquipmentSlotAssignment)
  .domainType(Character)

  .masterDataResource(r =>
    r
      .model(GS2.formation.Namespace)
      .bindings({
        name: Bind.static("CharacterEquipment"),
        logSetting: Bind.null(),
        updateFormScript: Bind.null(),
        updateMoldScript: Bind.null(),
        updatePropertyFormScript: Bind.null(),
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
      .addChild(PropertyFormModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.formation.PropertyForm)
      .mountLocal(Character)
      .linkedMasterResourceId(PropertyFormModel)
      .bindings({
        // An overlay's inherited properties have no local name, so the source
        // PropertyId is written directly.
        propertyId: Bind.domainProperty(Source.direct("Character", CHARACTER_PROPERTY_ID)),
        formId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      })
      .modelArrayDecodeBinding(
        "slots",
        Character,
        "equipmentSlots",
        [{ fieldName: "propertyId", targetPropertyName: "equipment" }],
        "name"
      )
  )
  .build();
