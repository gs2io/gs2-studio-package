import {
  defineOverlayDomainType,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import gachaSurface from "../../dsl/dependency-surface.json";

import characterDemoSurface from "../../../foundation-economy-character/live-demo/dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

import shopSurface from "../../../micro-shop-currency/dsl/dependency-surface.json";

const gacha = dependencyPackage(gachaSurface);

const characterDemo = dependencyPackage(characterDemoSurface);

const currency = dependencyPackage(currencySurface);

const shop = dependencyPackage(shopSurface);

const GachaRarity = gacha.type("GachaRarity");

const GachaRarityRate = gacha.type("GachaRarityRate");

const CharacterRate = gacha.type("CharacterRate");

const StoreProduct = shop.type("StoreProduct");

const WALLET_SLOT = 0;

const DRAW_COST = 10;

const COMMON = ["knight", "archer"] as const;

const RARE = ["mage", "healer"] as const;

const STANDARD = "standard";

const Gacha = defineOverlayDomainType("Gacha", gacha.overlay("Gacha"), {
  actionPropertyTransforms: [
    { targetProperty: gacha.propertyId("Gacha", "consumeActions"), mode: "replace", transformPackageId: currency.packageId, transformId: currency.transformId("WithdrawCurrency"), arguments: [
          { parameterName: "slot", source: { kind: "static", value: WALLET_SLOT } },
          { parameterName: "count", source: { kind: "static", value: DRAW_COST } },
          // Set the optional payment policy explicitly so the draw accepts the free balance without relying on an omitted argument.
          { parameterName: "paidOnly", source: { kind: "static", value: false } },
        ] },
  ],
});

export const microShopCharacterGachaDemo = definePackage({
  id: "micro-shop-character-gacha-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "キャラクターガチャ（デモデータ）",
      description: "ライブデモ用に、1 つのガチャとレアリティ別の排出率、抽選コストを揃えます。",
    },
    en: {
      label: "Character Gacha (demo data)",
      description: "Supplies one gacha, its per-rarity rates, and the coins a draw costs.",
    },
  },
  dependencies: liveDemoDependencies(
    gacha.packageId,
    characterDemo.packageId,
    "foundation-economy-character",
    "foundation-economy-character-dictionary",
    "foundation-economy-schedule",
    "foundation-economy-schedule-demo",
    "micro-shop-currency",
    currency.packageId,
    "foundation-economy-currency-demo"
  ),
  domainTypes: [Gacha],
  instances: [
    instance(GachaRarity, "common", {}),
    instance(GachaRarity, "rare", {}),
    instance(Gacha, STANDARD, {}),
    instance(GachaRarityRate, `${STANDARD}.common`, {
    [gacha.propertyId("GachaRarityRate", "gacha")]: STANDARD,
    [gacha.propertyId("GachaRarityRate", "rarity")]: "common",
    [gacha.propertyId("GachaRarityRate", "weight")]: 80,
  }),
    instance(GachaRarityRate, `${STANDARD}.rare`, {
    [gacha.propertyId("GachaRarityRate", "gacha")]: STANDARD,
    [gacha.propertyId("GachaRarityRate", "rarity")]: "rare",
    [gacha.propertyId("GachaRarityRate", "weight")]: 20,
  }),
    instance(CharacterRate, `common.${COMMON[0]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "common",
    [gacha.propertyId("CharacterRate", "character")]: COMMON[0],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  }),
    instance(CharacterRate, `common.${COMMON[1]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "common",
    [gacha.propertyId("CharacterRate", "character")]: COMMON[1],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  }),
    instance(CharacterRate, `rare.${RARE[0]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "rare",
    [gacha.propertyId("CharacterRate", "character")]: RARE[0],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  }),
    instance(CharacterRate, `rare.${RARE[1]}`, {
    [gacha.propertyId("CharacterRate", "rarity")]: "rare",
    [gacha.propertyId("CharacterRate", "character")]: RARE[1],
    [gacha.propertyId("CharacterRate", "weight")]: 1,
  }),
  ],
  uiComponents: [
    defineUiComponent(Gacha, {
  items: [
    UiItem.label("DrawLabel", UiSource.lit(`Draw a character for ${DRAW_COST} coins`), { name: "Gacha" }),
    UiItem.buttonAction("BuyButton", "Buy", { quantity: UiSource.lit(1) }, { name: "Gacha" }),
  ],
}),
    defineUiComponent(StoreProduct, {
  items: [
    UiItem.templateLabel("CoinsLabel", "{count} coins", { count: UiSource.inheritedProp(shop.propertyId("StoreProduct", "count")) }, { name: "StoreProduct" }),
  ],
}),
  ],
});
