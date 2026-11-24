import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  PT,
  scriptGrn,
  scriptSetting,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import updatePropertyFormLua from "./scripts/update-property-form.lua?raw";

const character = dependencyPackage(characterSurface);

const CHARACTER_PROPERTY_ID = character.propertyId("Character", "propertyId");

const EquipmentSlot = defineDomainType("EquipmentSlot", {
  properties: {
    propertyRegex: PT.string().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "装備スロット",
      description: "キャラクターの装備部位と装着できる装備カテゴリを設定します。",
    },
    en: {
      label: "Equipment slot",
      description: "Defines a character equipment slot and the equipment categories it accepts.",
    },
  },
  localizedProperties: {
    id: jaEnId("装備スロット", "equipment slot"),
    propertyRegex: jaEnField(
      "装着条件",
      "Equipment pattern",
      "このスロットへ装着できる装備個体IDの正規表現です。",
      "Regular expression matching equipment instance IDs accepted by this slot."
    ),
  },
});

const EquipmentSlotAssignment = defineDomainType("EquipmentSlotAssignment", {
  properties: {
    equipment: PT.string().userData(),
  },
  localizedDisplay: {
    ja: {
      label: "装着中の装備",
      description: "各装備スロットに現在装着されている装備を管理します。",
    },
    en: {
      label: "Worn equipment",
      description: "Tracks the equipment currently assigned to each loadout slot.",
    },
  },
  localizedProperties: {
    id: jaEnId("装着スロット", "equipment slot assignment"),
    equipment: jaEnField(
      "装着中の装備",
      "Equipped item",
      "このスロットに装着されている装備個体IDです。空の場合は未装着です。",
      "Equipment instance ID assigned to this slot; empty when the slot is free."
    ),
  },
});

const Character = defineOverlayDomainType("Character", character.overlay("Character"), {
  properties: {
    equipmentSlots: PT.listOf(PT.inline(EquipmentSlotAssignment)).userData(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター",
      description: "キャラクターごとの装備スロット構成と装着状態を管理します。",
    },
    en: {
      label: "Character",
      description: "Manages each character's equipment slot layout and current loadout.",
    },
  },
  localizedProperties: {
      equipmentSlots: jaEnField(
        "装備スロット",
        "Equipment slots",
        "キャラクターの各スロットに装着されている装備です。",
        "Equipment assigned to each slot on the character."
      ),
    },
});

const SCRIPT_NAMESPACE = "CharacterEquipmentScript";

const UPDATE_PROPERTY_FORM_SCRIPT = "UpdatePropertyForm";

const PropertyFormModel = defineMasterDataResource({
  model: GS2.formation.PropertyFormModel,
  bindings: {
      name: Bind.static("CharacterEquipment"),
      metadata: Bind.static(""),
    },
  arrayChildren: {
    slots: [
      defineMasterDataResource({
  model: GS2.formation.SlotModel,
  mount: EquipmentSlot,
  bindings: {
          name: Bind.domainProperty(Source.direct(EquipmentSlot, "id")),
          metadata: Bind.static(""),
          propertyRegex: Bind.domainProperty(Source.direct(EquipmentSlot, "propertyRegex")),
        },
}),
    ],
  },
});

export const microEconomyEquipmentLoadout = definePackage({
  id: "micro-economy-equipment-loadout",
  version: "0.0.1",
  display: {
    ja: {
      label: "装備の装着",
      description:
        "キャラクターごとの装備スロットを扱います。スロットごとに装着できる装備を制限できます。",
    },
    en: {
      label: "Equipment Loadout",
      description:
        "Gives each character its own equipment slots, with per-slot restrictions on what fits.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [EquipmentSlot, EquipmentSlotAssignment, Character],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.script.Namespace,
  bindings: {
        name: Bind.static(SCRIPT_NAMESPACE),
        ...Bind.nulls("logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    defineMasterDataResource({
  model: GS2.script.Script,
  bindings: {
          name: Bind.static(UPDATE_PROPERTY_FORM_SCRIPT),
          description: Bind.static("Keeps one piece of equipment on one character at a time."),
          script: Bind.static(updatePropertyFormLua),
          // The script compares ids; a numeric-looking id must stay a string.
          disableStringNumberToNumber: Bind.static(true),
        },
}),
  ],
}),
    defineMasterDataResource({
  model: GS2.formation.Namespace,
  bindings: {
        name: Bind.static("CharacterEquipment"),
        ...Bind.nulls("logSetting", "updateFormScript", "updateMoldScript"),
        updatePropertyFormScript: scriptSetting({
          triggerScriptId: scriptGrn(SCRIPT_NAMESPACE, UPDATE_PROPERTY_FORM_SCRIPT),
        }),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    PropertyFormModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.formation.PropertyForm,
  mount: Character,
  linkedMaster: PropertyFormModel,
  bindings: {
        // Use the dependency's PropertyId to preserve inherited identity in this overlay.
        propertyId: Bind.domainProperty(Source.direct(Character, CHARACTER_PROPERTY_ID)),
        formId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      },
  modelArrayDecodeBindings: [
    { parameterName: "slots", target: Character, targetListProperty: "equipmentSlots", fieldMappings: [{ fieldName: "propertyId", targetProperty: "equipment" }], idSourceField: "name" },
  ],
}),
  ],
});
