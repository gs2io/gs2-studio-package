/** Reuse the currency demo shelf and receipt settings so every demo deploys the same shared store content. */

import { definePackage, dependencyPackage } from "~/dsl";

import shopSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const shop = dependencyPackage(shopSurface);
const currency = dependencyPackage(currencySurface);

const StoreProduct = shop.type("StoreProduct");

export const microShopCurrencyDemo = definePackage("micro-shop-currency-demo", "0.0.0")
  .display({
    label: { ja: "通貨ショップ（デモデータ）", en: "Currency Shop (demo data)" },
    description: {
      ja: "ライブデモ用に、通貨デモの商品棚を通貨ショップへ並べます。",
      en: "Puts the currency demo's shelf in front of the currency shop.",
    },
  })
  .dependency(shop.packageId, "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")

  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")

  // Label the pack amount because prices belong to individual store currencies, not one product-wide price.
  .uiComponent(StoreProduct, ui =>
    ui.templateLabel(
      "CoinsLabel",
      "{count} coins",
      { count: ui.inheritedProp(shop.propertyId("StoreProduct", "count")) },
      { name: "StoreProduct" }
    )
  )
  .build();
