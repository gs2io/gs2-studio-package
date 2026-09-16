/**
 * Live demo content for `foundation-economy-character-dictionary`.
 *
 * A dex answers one question per character: has this player ever had one.
 * What is worth watching is that the answer is permanent — a character enters
 * the dex once, keeps the moment it first arrived, and its button stops being
 * usable, because there is no second first time.
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

/** The species a visitor can collect. Sorted the way a dex is read. */
const ROSTER = [
  ["knight", 100],
  ["mage", 200],
  ["archer", 300],
  ["healer", 400],
] as const;

/**
 * Registering a character, modelled as an exchange that costs nothing.
 *
 * The rate is mounted on `Character` so that each row carries its own: a
 * delegated action on a type must target a resource that mounts that type,
 * which is how the generated loader learns which rate a row's button trades.
 */
const MarkRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Character)
    .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
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
      ja: "ライブデモ用のキャラクター一覧と、図鑑に登録する操作を提供します。",
      en: "Supplies the roster the live demo shows, and the press that writes one into the dex.",
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
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterDictionaryMark"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Run and commit server-side: with auto-run off, `Exchange` hands back
        // a stamp sheet the client still has to execute, which can leave the
        // entry half-written if the page is closed mid-way.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(MarkRateModel)
  )

  .uiComponent(Character, ui =>
    ui.buttonAction("MarkButton", "Register", undefined, { name: "Character" })
  )

  .delegatedAction(Character, "Register", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: MarkRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
