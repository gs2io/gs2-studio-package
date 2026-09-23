/**
 * Live demo content for `micro-shop-currency`.
 *
 * The shop is the feature package: the showcase, the price table and the
 * purchase. What it sells, and for how much, ships nowhere in it — that is a
 * title's business — so this demo installs `foundation-economy-currency-demo`,
 * which stocks the shelf: its coin packs, the currency each grants and the
 * price it is sold at in each currency, and the store's test-receipt setting.
 *
 * A store product is the currency package's type, so every row of it lands in
 * the currency stack that every demo holding a wallet deploys. That demo is the
 * one place the shelf is authored; this one, like every other demo that deploys
 * that stack, derives from it rather than authoring a second version that the
 * last deploy would win with.
 *
 * It needs the purchase to be pressable. A purchase names the wallet it
 * deposits into and the receipt it verifies against through the transaction's
 * config, and neither is something the package that emitted the button could
 * know — a store sells to whichever wallet the buyer names. So the demo
 * presses `Buy` itself, from a behaviour of its own that supplies both.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import shopSurface from "../../dsl/dependency-surface.json";
import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

const shop = dependencyPackage(shopSurface);
const currency = dependencyPackage(currencySurface);

export const microShopCurrencyDemo = definePackage("micro-shop-currency-demo", "0.0.0")
  .display({
    label: { ja: "通貨ショップ（デモデータ）", en: "Currency Shop (demo data)" },
    description: {
      ja: "ライブデモ用に、通貨デモの商品棚を通貨ショップへ並べます。",
      en: "Puts the currency demo's shelf in front of the currency shop.",
    },
  })
  .dependency(shop.packageId, "github:gs2io/gs2-studio-package")
  // The shop sells currency, so the wallet it deposits into comes from the
  // currency package. An install does not walk a package's own dependencies,
  // so the base package is named here too.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")

  // The shelf and the store's test-receipt setting: authored once, there.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .build();
