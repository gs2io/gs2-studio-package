/**
 * Live demo content for `foundation-economy-character-dictionary`.
 *
 * A dex answers one question per character: has this player ever had one.
 * What is worth watching is that the answer is permanent — a character enters
 * the dex once and keeps the moment it first arrived, because there is no
 * second first time.
 *
 * Filing a character into the dex is not something a player does afterwards:
 * it is part of acquiring the character. This package used to say that by
 * carrying its own exchange with a copy of the character package's grant
 * beside its own dex entry — two authors of the same grant, which a third
 * package wanting a share of the same press could not join. It says it by
 * extension now: `foundation-economy-character-demo`'s recruit leaves a slot
 * open, and the overlay below appends the dex entry to it. The press is that
 * demo's, the roster is that demo's, and both acquire actions still commit
 * together on the one rate.
 *
 * The roster itself comes from `foundation-economy-character-demo`, installed
 * beside this package rather than written out again here. A row filed against
 * a dependency's type lands in that dependency's stack, and every demo that
 * pulls the same package shares it — so a second author of the same roster is
 * a second version of it, and whichever demo deployed last would win.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import dictionarySurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";

const dictionary = dependencyPackage(dictionarySurface);
// A demo installed beside another demo is a dependency like any other, so the
// recruit and its slot are addressed by name off the surface that demo
// publishes rather than by transcribing the ids it minted.
const characterDemo = dependencyPackage(characterDemoSurface);

export const foundationEconomyCharacterDictionaryDemo = definePackage(
  "foundation-economy-character-dictionary-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター図鑑（デモデータ）", en: "Character Dex (demo data)" },
    description: {
      ja: "ライブデモ用のキャラクター一覧と、勧誘が図鑑を埋めるようにする拡張を提供します。",
      en: "Supplies the roster the live demo shows, and makes recruiting fill the dex.",
    },
  })
  .dependency(dictionary.packageId, "github:gs2io/gs2-studio-package")
  // The roster, the level curve, the capacity and the recruit itself come from
  // the character package's own demo rather than being written out again here.
  // Rows filed against a dependency's types land in that dependency's stack,
  // which every demo pulling the same package shares, so a second author of
  // the same content is a second version of it and the last deploy wins.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  // The dex overlays a type the character package owns, and an install does not
  // walk a package's own dependencies, so the base package is named here too.
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")

  // Recruiting files the character into the dex. The action is appended to the
  // recruit's open slot rather than replacing what it grants, so the character
  // package's own grant still runs and a third package can append beside this
  // one without either of them knowing about the other.
  .overlayTypeSpec("CharacterRecruit", {
    ...characterDemo.overlay("CharacterRecruit"),
    actionPropertyTransforms: [
      {
        targetProperty: characterDemo.propertyId("CharacterRecruit", "extraActions"),
        kind: "transformEntries",
        mode: "append",
        entries: [
          {
            transformPackageId: dictionary.packageId,
            transformName: "MarkCharacterDictionary",
            arguments: [
              {
                parameterName: "character",
                source: {
                  kind: "domainProperty",
                  propertyName: characterDemo.propertyId("CharacterRecruit", "character"),
                },
              },
            ],
          },
        ],
      },
    ],
  })
  .build();
