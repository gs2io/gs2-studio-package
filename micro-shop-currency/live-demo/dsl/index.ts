import {
  definePackage,
  defineUiComponent,
  dependencyPackage,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import shopSurface from "../../dsl/dependency-surface.json";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const shop = dependencyPackage(shopSurface);

const currency = dependencyPackage(currencySurface);

const StoreProduct = shop.type("StoreProduct");

export const microShopCurrencyDemo = definePackage({
  id: "micro-shop-currency-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "通貨ショップ（デモデータ）",
      description: "ライブデモ用に、通貨デモの商品棚を通貨ショップへ並べます。",
    },
    en: {
      label: "Currency Shop (demo data)",
      description: "Puts the currency demo's shelf in front of the currency shop.",
    },
  },
  dependencies: liveDemoDependencies(
    shop.packageId,
    currency.packageId,
    "foundation-economy-currency-demo"
  ),
  uiComponents: [
    defineUiComponent(StoreProduct, {
  items: [
    UiItem.templateLabel("CoinsLabel", "{count} coins", { count: UiSource.inheritedProp(shop.propertyId("StoreProduct", "count")) }, { name: "StoreProduct" }),
  ],
}),
  ],
});
