import { definePackage, dependencyPackage } from "~/dsl";

import gachaSurface from "../../dsl/dependency-surface.json";
import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";
import shopSurface from "../../../micro-shop-currency/dsl/dependency-surface.json";

const gacha = dependencyPackage(gachaSurface);
const characterDemo = dependencyPackage(characterDemoSurface);
const currency = dependencyPackage(currencySurface);
const shop = dependencyPackage(shopSurface);

const Gacha = gacha.type("Gacha");
const GachaRarity = gacha.type("GachaRarity");
const GachaRarityRate = gacha.type("GachaRarityRate");
const CharacterRate = gacha.type("CharacterRate");
const StoreProduct = shop.type("StoreProduct");

const WALLET_SLOT = 0;

const DRAW_COST = 10;

const COMMON = ["knight", "archer"] as const;
const RARE = ["mage", "healer"] as const;

const STANDARD = "standard";

export const microShopCharacterGachaDemo = definePackage("micro-shop-character-gacha-demo", "0.0.0")
  .display({
    label: { ja: "キャラクターガチャ（デモデータ）", en: "Character Gacha (demo data)" },
    description: {
      ja: "ライブデモ用に、1 つのガチャとレアリティ別の排出率、抽選コストを揃えます。",
      en: "Supplies one gacha, its per-rarity rates, and the coins a draw costs.",
    },
  })
  .dependency(gacha.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared roster so this demo cannot deploy conflicting character content.
  .dependency(characterDemo.packageId, "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character-dictionary", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  // Reuse shared schedule content even though this page shows no events, because it deploys the same schedule stack.
  .dependency("foundation-economy-schedule-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the shared currency shelf and test-receipt settings so wallet and shop demos deploy identical content.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")

  .instance(GachaRarity, "common", {})
  .instance(GachaRarity, "rare", {})

  // Leave the schedule unset so drawing remains available throughout a demo visit.
  .instance(Gacha, STANDARD, {})

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
              // Set the optional payment policy explicitly so the draw accepts the free balance without relying on an omitted argument.
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

  .uiComponent(Gacha, ui =>
    ui
      .label("DrawLabel", ui.lit(`Draw a character for ${DRAW_COST} coins`), { name: "Gacha" })
      .buttonAction("BuyButton", "Buy", { quantity: ui.lit(1) }, { name: "Gacha" })
  )

  .uiComponent(StoreProduct, ui =>
    ui.templateLabel(
      "CoinsLabel",
      "{count} coins",
      { count: ui.inheritedProp(shop.propertyId("StoreProduct", "count")) },
      { name: "StoreProduct" }
    )
  )
  .build();
