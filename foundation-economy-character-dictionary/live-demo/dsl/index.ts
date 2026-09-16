/**
 * Live demo content for `foundation-economy-character-dictionary`.
 *
 * A dex answers one question per character: has this player ever had one.
 * What is worth watching is that the answer is permanent — a character enters
 * the dex once, keeps the moment it first arrived, and its button stops being
 * usable, because there is no second first time.
 *
 * Filing a character into the dex is not something a player does afterwards:
 * it is part of acquiring the character. So the press below recruits and
 * files in one transaction, by carrying both acquire actions on a single
 * rate. The recruit in `foundation-economy-character-demo` stays as it is —
 * that rate is shared with demos that only want a roster, and an action
 * naming a package they do not install would be dropped from their deploy.
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

const dictionary = dependencyPackage(dictionarySurface);

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
 * commit together or not at all. The acquire comes first, matching the gacha's
 * rate and the order the transaction reads in.
 *
 * That order is not free. The id ledger's structure tokens carry the array
 * index, so an entry's id follows its position rather than what it does:
 * putting the acquire first handed it the id the dex entry used to hold, and
 * the dex entry took a new one. Nothing outside this package names either, so
 * the churn is invisible here — but reordering these later would move them
 * again.
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
  .dependency("foundation-economy-character-demo", "github:gs2io/gs2-studio-package")
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
