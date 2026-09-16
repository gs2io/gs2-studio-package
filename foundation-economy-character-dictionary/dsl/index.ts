import {
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import { jaEnField } from "../../dsl/jaEnField";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const character = dependencyPackage(characterSurface);

const Character = defineOverlayDomainType("Character", character.overlay("Character"), domainType =>
  domainType
    .property(PT.bool("acquired").userData().required())
    .property(PT.timestamp("acquiredAt").userData().required())
    .localizedProperties({
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
    })
);

const EntryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.dictionary.EntryModel)
    .mountLocal(Character)
    .bindings({
      name: Bind.domainProperty(Source.direct(Character, "id")),
    })
);

export const foundationEconomyCharacterDictionary = definePackage(
  "foundation-economy-character-dictionary",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター図鑑", en: "Character Dex" },
    description: {
      ja: "これまでに入手したキャラクターの種類を記録する図鑑機能です。",
      en: "Keeps a dex of every character species the player has ever obtained.",
    },
  })
  .displayType(Character, {
    label: { ja: "キャラクター", en: "Character" },
    description: {
      ja: "キャラクター図鑑に表示するキャラクターと閲覧状態を管理します。",
      en: "Manages the characters shown in the character encyclopedia and their view state.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(Character)

  .masterDataResource(r => {
    r.model(GS2.dictionary.Namespace)
      .bindings({
        name: Bind.static("CharacterDictionary"),
        transactionSetting: transactionSetting(),
        ...Bind.nulls("logSetting", "entryScript", "duplicateEntryScript"),
      })
      .addChild(EntryModel);
  })

  .userDataResource(r => {
    r.model(GS2.dictionary.Entry)
      .linkedMasterResourceId(EntryModel)
      .existenceProperty("acquired")
      .bindings({
        acquiredAt: Bind.domainProperties([Source.direct(Character, "acquiredAt")]),
        entryId: Bind.skip(),
        name: Bind.skip(),
      });
  })

  // What a dex entry is worth knowing: whether this character has ever been
  // obtained, and when it first was. Both readings belong here rather than in
  // a screen, because `acquired` and `acquiredAt` are this package's own
  // properties and every title that keeps a dex asks the same two questions.
  .uiComponent(Character, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "Character" })
      .value("AcquiredAtValue", ui.prop("acquiredAt"), { name: "Character" })
      // A character already in the dex cannot be added to it again, so
      // anything that registers one stops being usable once it is registered.
      .interactable("UnregisteredInteractable", UiCond.not(UiCond.truthy(ui.prop("acquired"))), {
        name: "Character",
      })
  )

  .actionTransform("MarkCharacterDictionary", at =>
    at
      .category("acquire")
      .parameter("character", { type: PT.ref("Character") })
      .output("Gs2Dictionary:AddEntriesByUserId", o =>
        o
          .resourceRef(() => EntryModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("entryModelNames[0]", "character")
      )
  )
  .build();
