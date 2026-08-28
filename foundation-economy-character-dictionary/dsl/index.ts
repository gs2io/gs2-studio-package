import {
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const Character = defineOverlayDomainType(
  "Character",
  {
    source: {
      kind: "dependency",
      directSourcePackageId: "foundation-economy-character",
      directSourceTypeId: "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5",
      sourcePackageId: "foundation-economy-character",
      sourceTypeId: "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5",
    },
  },
  domainType =>
    domainType
      .property(PT.bool("acquired").userData().required())
      .property(PT.timestamp("acquiredAt").userData().required())
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
        transactionSetting: {
          enableAutoRun: Bind.static(false),
          enableAtomicCommit: Bind.static(false),
          transactionUseDistributor: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          acquireActionUseJobQueue: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
        },
        logSetting: Bind.null(),
        entryScript: Bind.null(),
        duplicateEntryScript: Bind.null(),
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
