/**
 * Live demo content for `micro-shop-character-gacha`.
 *
 * The feature package is the machine: a gacha draws a rarity, the rarity
 * draws a character, and the character lands in the roster and the dex. It
 * ships no gachas, no rarities and no rates, because what a title puts in its
 * gacha is the title's business. A demo of it supplies one gacha worth
 * pulling, and the two things a visitor needs to pull it: characters to win,
 * and currency to spend.
 *
 * The characters are `foundation-economy-character-demo`'s roster, installed
 * beside this package rather than written out again. A row filed against a
 * dependency's type lands in that dependency's stack, and every demo that
 * pulls the same package shares it — so a second author of the same roster
 * would be a second version of it, and the last deploy would win. The recruit
 * that demo also carries is left off this page: a roster a visitor can have
 * for nothing is not one worth drawing for.
 *
 * The currency comes from the shop, which the gacha package depends on and
 * which is how this demo's visitor gets coins: the products are the shop
 * package's own rows. What a browser cannot do is complete a real store
 * purchase, so the currency package's store is told to accept the test
 * receipt — the same row the shop's demo authors, and the same value, so the
 * shared currency stack reads the same whichever demo deployed last.
 *
 * One draw costs coins from the wallet the shop fills. The cost is the
 * currency package's own withdraw, bound into the gacha's `consumeActions`
 * slot by an overlay of the gacha type — the way a package attaches an action
 * to a slot another package left open, so the currency namespace is resolved
 * by reference rather than spelled out here.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import gachaSurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const gacha = dependencyPackage(gachaSurface);
// A demo installed beside another demo is a dependency like any other: its
// rows are addressed by name off the surface it publishes.
const characterDemo = dependencyPackage(characterDemoSurface);
const currency = dependencyPackage(currencySurface);

const Gacha = gacha.type("Gacha");
const GachaRarity = gacha.type("GachaRarity");
const GachaRarityRate = gacha.type("GachaRarityRate");
const CharacterRate = gacha.type("CharacterRate");

/** The wallet the shop deposits into and the gacha draws from. */
const WALLET_SLOT = 0;

/** What one pull costs, in the shop's coins. Tier 1 buys ten. */
const DRAW_COST = 10;

/** The roster `foundation-economy-character-demo` ships, by rarity. */
const COMMON = ["knight", "archer"] as const;
const RARE = ["mage", "healer"] as const;

const STANDARD = "standard";

export const microShopCharacterGachaDemo = definePackage("micro-shop-character-gacha-demo", "0.0.0")
  .display({
    label: { ja: "キャラガチャ（デモデータ）", en: "Character Gacha (demo data)" },
    description: {
      ja: "ライブデモ用に、1つのガチャとレアリティ別の排出率、抽選コストを揃えます。",
      en: "Supplies one gacha, its per-rarity rates, and the coins a draw costs.",
    },
  })
  .dependency(gacha.packageId, "github:gs2io/gs2-studio-package")
  // The roster comes from the character package's own demo. The dex, the
  // schedule and the shop are the feature package's dependencies, and an
  // install does not walk a package's own dependencies, so each is named here.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character-dictionary", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // The dex's and the schedule's demos add nothing this page shows. They are
  // installed because their rows live in stacks this demo deploys too: the
  // dex demo makes the roster's recruit file into the dex, and the schedule
  // demo authors the event windows. Deployed from here without them, those
  // stacks would lose what the other demos put there.
  .dependency("foundation-economy-character-dictionary-demo", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")
  // The coins: the shop sells them, and the currency package is what the
  // wallet and the store are rows of.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")

  // A browser cannot complete a real store purchase, so the demo's store takes
  // the test receipt the client sends. The shipped package keeps rejecting it.
  .instance(currency.type("CurrencyStore"), "currencystore", {
    [currency.propertyId("CurrencyStore", "enableFakeReceipt")]: "Accept",
  })

  // Two tiers, so a visitor can see the rates matter: four pulls in five land
  // a common character.
  .instance(GachaRarity, "common", {})
  .instance(GachaRarity, "rare", {})

  // The one gacha. It runs whenever the page is open: the schedule a gacha
  // can be pinned to is left off, so the showcase sells it without a window.
  // Its cost is not authored on the row; the overlay below supplies it.
  .instance(Gacha, STANDARD, {})

  // A draw costs coins. The currency package's withdraw is bound into the
  // slot the feature package left for a draw's cost, with the wallet slot the
  // page shows and the price of one pull.
  .overlayTypeSpec("Gacha", {
    ...gacha.overlay("Gacha"),
    actionPropertyTransforms: [
      {
        targetProperty: gacha.propertyId("Gacha", "consumeActions"),
        kind: "transformEntries",
        mode: "replace",
        entries: [
          {
            transformPackageId: currency.packageId,
            transformName: "WithdrawCurrency",
            arguments: [
              { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
              { parameterName: "count", source: { kind: "static", value: DRAW_COST } },
              // Free coins count too. The transform leaves this optional, and
              // an output that names it drops the whole action when it is not
              // supplied, so it is said here rather than left to a default.
              { parameterName: "paidOnly", source: { kind: "static", value: false } },
            ],
          },
        ],
      },
    ],
  })

  .instance(GachaRarityRate, `${STANDARD}.common`, {
    [gacha.propertyId("GachaRarityRate", "gacha")]: STANDARD,
    [gacha.propertyId("GachaRarityRate", "rarity")]: "common",
    [gacha.propertyId("GachaRarityRate", "weight")]: 80,
  })
  .instance(GachaRarityRate, `${STANDARD}.rare`, {
    [gacha.propertyId("GachaRarityRate", "gacha")]: STANDARD,
    [gacha.propertyId("GachaRarityRate", "rarity")]: "rare",
    [gacha.propertyId("GachaRarityRate", "weight")]: 20,
  })

  // Even odds within a tier; the tier is where the rate lives.
  .instance(CharacterRate, `common.${COMMON[0]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "common",
    [gacha.propertyId("CharacterRate", "character")]: COMMON[0],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  })
  .instance(CharacterRate, `common.${COMMON[1]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "common",
    [gacha.propertyId("CharacterRate", "character")]: COMMON[1],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  })
  .instance(CharacterRate, `rare.${RARE[0]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "rare",
    [gacha.propertyId("CharacterRate", "character")]: RARE[0],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  })
  .instance(CharacterRate, `rare.${RARE[1]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "rare",
    [gacha.propertyId("CharacterRate", "character")]: RARE[1],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  })

  // The row says which gacha it is, and the button draws one. `Buy` is the
  // feature package's action, named here by the name that package publishes
  // it under; one draw per press, which is what the showcase sells.
  .uiComponent(Gacha, ui =>
    ui
      .templateLabel("NameLabel", "{id}", { id: ui.prop("id") }, { name: "Gacha" })
      .buttonAction("BuyButton", "Buy", { quantity: ui.lit(1) }, { name: "Gacha" })
  )
  .build();
