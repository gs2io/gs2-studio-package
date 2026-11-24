import {
  Bind,
  defineActionTransform,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  dependencyPackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import { jaEnField } from "../../dsl/jaEnField";

const character = dependencyPackage(characterSurface);

const Character = defineOverlayDomainType("Character", character.overlay("Character"), {
  properties: {
    acquired: PT.bool().userData().required(),
    acquiredAt: PT.timestamp().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "キャラクター",
      description: "キャラクター図鑑に表示するキャラクターと閲覧状態を管理します。",
    },
    en: {
      label: "Character",
      description:
        "Manages the characters shown in the character encyclopedia and their view state.",
    },
  },
  localizedProperties: {
      acquired: jaEnField(
        "図鑑登録済み",
        "Registered",
        "このキャラクターが図鑑に登録済みかを示します。",
        "Whether this character is registered in the encyclopedia."
      ),
      acquiredAt: jaEnField(
        "初回獲得日時",
        "First acquired at",
        "このキャラクターを初めて獲得した日時です。",
        "Time when this character was first acquired."
      ),
    },
});

const EntryModel = defineMasterDataResource({
  model: GS2.dictionary.EntryModel,
  mount: Character,
  bindings: {
      name: Bind.domainProperty(Source.direct(Character, "id")),
    },
});

const MarkCharacterDictionaryTransform = defineActionTransform("MarkCharacterDictionary", {
  category: "acquire",
  parameters: {
    character: { type: PT.ref(Character) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Dictionary:AddEntriesByUserId",
    resource: () => EntryModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      "entryModelNames[0]": OutputMap.parameter("character"),
    },
  },
  ],
});

export const foundationEconomyCharacterDictionary = definePackage({
  id: "foundation-economy-character-dictionary",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクター図鑑",
      description: "これまでに入手したキャラクターの種類を図鑑に記録します。",
    },
    en: {
      label: "Character Dex",
      description: "Keeps a dex of every character species the player has ever obtained.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [Character],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.dictionary.Namespace,
  bindings: {
        name: Bind.static("CharacterDictionary"),
        transactionSettingV2: transactionSettingV2(),
        ...Bind.nulls("logSetting", "entryScript", "duplicateEntryScript"),
      },
  children: [
    EntryModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.dictionary.Entry,
  linkedMaster: EntryModel,
  existenceProperty: "acquired",
  bindings: {
        acquiredAt: Bind.domainProperties([Source.direct(Character, "acquiredAt")]),
        entryId: Bind.skip(),
        name: Bind.skip(),
      },
}),
  ],
  actionTransforms: [MarkCharacterDictionaryTransform],
  uiComponents: [
    defineUiComponent(Character, {
  items: [
    UiItem.templateLabel("NameLabel", "{id}", { id: UiSource.prop("id") }, { name: "Character" }),
    UiItem.templateLabel("AcquiredAtLabel", "{acquiredAt}", { acquiredAt: UiSource.prop("acquiredAt") }, { name: "Character" }),
    UiItem.value("AcquiredAtValue", UiSource.prop("acquiredAt"), { name: "Character" }),
    UiItem.interactable("UnregisteredInteractable", UiCond.not(UiCond.truthy(UiSource.prop("acquired"))), {
        name: "Character",
      }),
    UiItem.label("AcquiredLabel", UiSource.lit("Not yet"), { name: "Character" }),
    UiItem.activeToggle("UnacquiredActiveToggle", UiCond.not(UiCond.truthy(UiSource.prop("acquired"))), {
        name: "Character",
      }),
    UiItem.activeToggle("AcquiredActiveToggle", UiCond.truthy(UiSource.prop("acquired")), {
        name: "Character",
      }),
  ],
}),
  ],
});
