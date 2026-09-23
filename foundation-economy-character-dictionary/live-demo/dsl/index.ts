/**
 * Live demo content for `foundation-economy-character-dictionary`.
 *
 * A dex answers one question per character: has this player ever had one.
 * What is worth watching is that the answer is permanent — a character enters
 * the dex once, keeps the moment it first arrived, and its button stops being
 * offered, because there is no second first time.
 *
 * Filing a character into the dex is not something a player does afterwards:
 * it is part of acquiring the character. So the press below recruits and
 * files in one transaction, by carrying both acquire actions on a single rate
 * of this package's own.
 *
 * The rate is this package's rather than an addition to the recruit in
 * `foundation-economy-character-demo`, because that recruit lives in the
 * character demo's stack, which every demo holding a roster deploys. Appending
 * the dex entry to it made that stack read differently depending on whether
 * the deploying demo installed this one, and the last deploy decided whether
 * recruiting filled the dex at all. A rate here lands in this package's own
 * stack and changes nothing another demo deploys. The cost is that the recruit
 * rate is written twice — here and in the character demo — so a change to one
 * (another action, a different count) does not reach the other.
 *
 * The roster itself comes from `foundation-economy-character-demo`, installed
 * beside this package rather than written out again here. A row filed against
 * a dependency's type lands in that dependency's stack, and every demo that
 * pulls the same package shares it — so a second author of the same roster is
 * a second version of it, and whichever demo deployed last would win.
 */

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

/** The package owning `AcquireCharacter`, addressed by name like any dependency. */
const CHARACTER_PACKAGE_ID = "foundation-economy-character";

/**
 * Recruiting a character, modelled as an exchange that costs nothing.
 *
 * The rate is mounted on `Character` so that each row carries its own: a
 * delegated action on a type must target a resource that mounts that type,
 * which is how the generated loader learns which rate a row's button trades.
 *
 * Both acquire actions ride the same rate, so a recruit and its dex entry
 * commit together or not at all. The acquire comes first, matching the order
 * the transaction reads in.
 */
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
  // The roster, the level curve and the capacity come from the character
  // package's own demo rather than being written out again here. Rows filed
  // against a dependency's types land in that dependency's stack, which every
  // demo pulling the same package shares, so a second author of the same
  // content is a second version of it and the last deploy wins.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  // The dex overlays a type the character package owns, and an install does not
  // walk a package's own dependencies, so the base package is named here too.
  // It also owns `AcquireCharacter`, which the rate above trades for.
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
        // Run and commit server-side: with auto-run off, `Exchange` hands back
        // a stamp sheet the client still has to execute, which can leave the
        // character granted but the dex entry unwritten if the page is closed
        // mid-way.
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
