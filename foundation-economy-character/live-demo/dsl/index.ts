/**
 * Live demo content for `foundation-economy-character`.
 *
 * The feature package defines the character model but ships no rows — a title
 * supplies its own roster, level curve and inventory size. This package
 * provides a small roster so the demo has something to show.
 */

import { defineOverlayDomainType, definePackage } from "~/dsl";

const CHARACTER_PACKAGE_ID = "foundation-economy-character";

const CHARACTER_TYPE_ID = "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5";
const CHARACTER_COLLECTION_TYPE_ID = "dt_ZR7PA0W682HX7ZFXGBE4BRF37K";
const CHARACTER_EXPERIENCE_TYPE_ID = "dt_HAZCRJ576BHDWFVB28NQW77Y01";

// A DSL build does not read its dependency closure, so properties inherited
// from the source types are addressed by id.
const CHARACTER_SORT = "prop_A5DDXX9AZGPBWRFX70X1ZKNR0E";
const COLLECTION_DEFAULT_CAPACITY = "prop_A3GQRDCNGWBQCT773D3173ZMN1";
const COLLECTION_MAXIMUM_CAPACITY = "prop_3THQSBRP9PCYM426V54R4CZ8BF";
const EXPERIENCE_THRESHOLD = "prop_CP6T6EBWNEYWASFRXVMH0A8RPF";
const EXPERIENCE_DEFAULT_LEVEL_CAP = "prop_B2ZMJ5P9J9QVBZTGHD6816BX7Z";
const EXPERIENCE_MAX_LEVEL_CAP = "prop_88HQTS8WPSVYE7PAJ2BYRE0D4C";

function overlayOf(name: string, sourceTypeId: string, singleEntry: boolean) {
  return defineOverlayDomainType(
    name,
    {
      source: {
        directSourcePackageId: CHARACTER_PACKAGE_ID,
        directSourceTypeId: sourceTypeId,
        sourcePackageId: CHARACTER_PACKAGE_ID,
        sourceTypeId,
      },
      singleEntry,
      compositeKeyMode: { kind: "inherit" },
    },
    domainType => domainType
  );
}

const Character = overlayOf("Character", CHARACTER_TYPE_ID, false);
const CharacterCollection = overlayOf(
  "CharacterCollection",
  CHARACTER_COLLECTION_TYPE_ID,
  true
);
const CharacterExperience = overlayOf(
  "CharacterExperience",
  CHARACTER_EXPERIENCE_TYPE_ID,
  true
);

/**
 * A gentle curve: ten levels reachable inside a short demo session, with
 * headroom left so the level cap sits visibly below the maximum. GS2 rejects
 * a threshold below 1, so the first entry starts at 1 rather than 0.
 */
const EXPERIENCE_CURVE = [1, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

export const foundationEconomyCharacterDemo = definePackage(
  "foundation-economy-character-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター（デモデータ）", en: "Characters (demo data)" },
    description: {
      ja: "ライブデモ用のキャラクター編成・レベル曲線・所持枠を提供します。",
      en: "Supplies the roster, level curve and capacity used by the live demo.",
    },
  })
  .dependency(CHARACTER_PACKAGE_ID, "github:gs2io/gs2-studio-package")
  .domainType(Character)
  .domainType(CharacterCollection)
  .domainType(CharacterExperience)

  .instance("CharacterExperience", "characterexperience", {
    [EXPERIENCE_THRESHOLD]: EXPERIENCE_CURVE,
    [EXPERIENCE_DEFAULT_LEVEL_CAP]: 10,
    [EXPERIENCE_MAX_LEVEL_CAP]: 50,
  })
  .instance("CharacterCollection", "charactercollection", {
    [COLLECTION_DEFAULT_CAPACITY]: 20,
    [COLLECTION_MAXIMUM_CAPACITY]: 100,
  })

  .instance("Character", "knight", { [CHARACTER_SORT]: 100 })
  .instance("Character", "mage", { [CHARACTER_SORT]: 200 })
  .instance("Character", "archer", { [CHARACTER_SORT]: 300 })
  .instance("Character", "healer", { [CHARACTER_SORT]: 400 })
  .build();
