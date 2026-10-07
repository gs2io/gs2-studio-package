/** Own the combined recruit rate here so enabling dex registration cannot change the shared character demo stack. */

import {
  Arg,
  Bind,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import dictionarySurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";

const dictionary = dependencyPackage(dictionarySurface);
const characterDemo = dependencyPackage(characterDemoSurface);

const Character = dictionary.type("Character");

const CHARACTER_PACKAGE_ID = "foundation-economy-character";

/** Keep recruitment and dex registration in one atomic exchange so neither can commit alone. */
const DexRecruitRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Character)
    .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Character)
        .bindings({
          action: Bind.transform(CHARACTER_PACKAGE_ID, "AcquireCharacter", [
            Arg.domainProperty("character", Source.direct(Character, "id")),
            Arg.static("count", 1),
          ]),
        });
    })
    .addArrayChild("acquireActions", dictionaryAction => {
      dictionaryAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Character)
        .bindings({
          action: Bind.transform(dictionary.packageId, "MarkCharacterDictionary", [
            Arg.domainProperty("character", Source.direct(Character, "id")),
          ]),
        });
    })
);

export const foundationEconomyCharacterDictionaryDemo = definePackage(
  "foundation-economy-character-dictionary-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター図鑑（デモデータ）", en: "Character Dex (demo data)" },
    description: {
      ja: "ライブデモ用のキャラクター一覧と、勧誘して図鑑を埋める操作を提供します。",
      en: "Supplies the roster the live demo shows, and the press that recruits one into the dex.",
    },
  })
  .dependency(dictionary.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared roster and level curve so demos cannot deploy conflicting versions of the same dependency stack.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  // Declare the base package because this rate directly calls its AcquireCharacter transform.
  .dependency(CHARACTER_PACKAGE_ID, "github:gs2io/gs2-studio-package")

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterDexRecruit"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the combined transaction without a second request from the page.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(DexRecruitRateModel)
  )

  .uiComponent(Character, ui =>
    ui.buttonAction("RecruitButton", "Recruit", undefined, { name: "Character" })
  )

  .delegatedAction(Character, "Recruit", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: DexRecruitRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
