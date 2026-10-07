import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  scriptGrn,
  scriptSetting,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import updatePropertyFormLua from "./scripts/update-property-form.lua?raw";

const character = dependencyPackage(characterSurface);

const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

const EquipmentSlot = defineDomainType("EquipmentSlot", dt =>
  dt
    .property(
      PT.string("propertyRegex")
        .masterData()
        .required()
        .description("Which equipment this slot accepts, matched on its property id")
    )
    .localizedProperties({
      id: jaEnId("装備スロット", "equipment slot"),
      propertyRegex: jaEnField(
        "装着条件",
        "Equipment pattern",
        "このスロットへ装着できる装備個体IDの正規表現です。",
        "Regular expression matching equipment instance IDs accepted by this slot."
      ),
    })
);

const EquipmentSlotAssignment = defineDomainType("EquipmentSlotAssignment", dt =>
  dt
    .property(
      PT.string("equipment")
        .userData()
        .description("Property id of the equipment worn here, empty when the slot is free")
    )
    .localizedProperties({
      id: jaEnId("装着スロット", "equipment slot assignment"),
      equipment: jaEnField(
        "装着中の装備",
        "Equipped item",
        "このスロットに装着されている装備個体IDです。空の場合は未装着です。",
        "Equipment instance ID assigned to this slot; empty when the slot is free."
      ),
    })
);

const Character = defineOverlayDomainType("Character", character.overlay("Character"), domainType =>
  domainType
    .property(PT.prop("equipmentSlots", PT.listOf(PT.inline("EquipmentSlotAssignment"))).userData())
    .localizedProperties({
      equipmentSlots: jaEnField(
        "装備スロット",
        "Equipment slots",
        "キャラクターの各スロットに装着されている装備です。",
        "Equipment assigned to each slot on the character."
      ),
    })
);

/** Validate equipment ownership before saving a loadout so two characters cannot wear the same instance. */
const SCRIPT_NAMESPACE = "CharacterEquipmentScript";
const UPDATE_PROPERTY_FORM_SCRIPT = "UpdatePropertyForm";

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
      .model(GS2.script.Namespace)
      .bindings({
        name: Bind.static(SCRIPT_NAMESPACE),
        ...Bind.nulls("logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(script =>
        script.model(GS2.script.Script).bindings({
          name: Bind.static(UPDATE_PROPERTY_FORM_SCRIPT),
          description: Bind.static("Keeps one piece of equipment on one character at a time."),
          script: Bind.static(updatePropertyFormLua),
          // The script compares ids; a numeric-looking id must stay a string.
          disableStringNumberToNumber: Bind.static(true),
        })
      )
  )

  .masterDataResource(r =>
    r
      .model(GS2.formation.Namespace)
      .bindings({
        name: Bind.static("CharacterEquipment"),
        ...Bind.nulls("logSetting", "updateFormScript", "updateMoldScript"),
        updatePropertyFormScript: scriptSetting({
          triggerScriptId: scriptGrn(SCRIPT_NAMESPACE, UPDATE_PROPERTY_FORM_SCRIPT),
        }),
        transactionSetting: transactionSetting(),
      })
      .addChild(PropertyFormModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.formation.PropertyForm)
      .mountLocal(Character)
      .linkedMasterResourceId(PropertyFormModel)
      .bindings({
        // Use the dependency's PropertyId to preserve inherited identity in this overlay.
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
