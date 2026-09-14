/**
 * Live demo content for `foundation-economy-character`.
 *
 * The feature package defines the character model but ships no rows — a title
 * supplies its own roster, level curve and inventory size. This package
 * provides a small roster so the demo has something to show.
 */

import { defineOverlayDomainType, definePackage, dependencyPackage } from "~/dsl";

import characterSurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const character = dependencyPackage(characterSurface);

const Character = defineOverlayDomainType(
  "Character",
  character.overlay("Character"),
  domainType => domainType
);
const CharacterCollection = defineOverlayDomainType(
  "CharacterCollection",
  character.overlay("CharacterCollection"),
  domainType => domainType
);
const CharacterExperience = defineOverlayDomainType(
  "CharacterExperience",
  character.overlay("CharacterExperience"),
  domainType => domainType
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
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  .domainType(Character)
  .domainType(CharacterCollection)
  .domainType(CharacterExperience)

  .instance("CharacterExperience", "characterexperience", {
    [character.propertyId("CharacterExperience", "threshold")]: EXPERIENCE_CURVE,
    [character.propertyId("CharacterExperience", "defaultLevelCap")]: 10,
    [character.propertyId("CharacterExperience", "maxLevelCap")]: 50,
  })
  .instance("CharacterCollection", "charactercollection", {
    [character.propertyId("CharacterCollection", "defaultCapacity")]: 20,
    [character.propertyId("CharacterCollection", "maximumCapacity")]: 100,
  })

  .instance("Character", "knight", { [character.propertyId("Character", "sort")]: 100 })
  .instance("Character", "mage", { [character.propertyId("Character", "sort")]: 200 })
  .instance("Character", "archer", { [character.propertyId("Character", "sort")]: 300 })
  .instance("Character", "healer", { [character.propertyId("Character", "sort")]: 400 })
  .build();
