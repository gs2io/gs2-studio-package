/**
 * Live demo content for `micro-shop-currency`.
 *
 * The shop is already whole in the feature package: the products, the prices
 * each is sold at in each currency, the showcase they are displayed through,
 * and the purchase itself. A demo of it adds no shop content — what it adds is
 * the things a shop needs around it to be watchable.
 *
 * It needs somewhere for the currency to land, and it needs a browser to be
 * able to buy at all. The wallet comes from `foundation-economy-currency`,
 * which this package depends on; the test receipt is accepted by a setting on
 * that package's store, which the shipped package is right to leave off and
 * this demo turns on.
 *
 * That package's own demo is not installed beside this one, though it would
 * have brought both. It stocks the shelf with products of its own, and a store
 * product is the currency package's type, so two packages holding rows of it
 * leaves no answer to which one's stack they belong in — the deploy build says
 * so rather than picking. Its deposit buttons would be beside the point here
 * anyway: buying is how a visitor gets currency in this demo.
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
      ja: "ライブデモ用に、通貨ショップの購入先となるウォレットとテスト購入の設定を揃えます。",
      en: "Supplies the wallet a purchase lands in, and the test-purchase setting it needs.",
    },
  })
  .dependency(shop.packageId, "github:gs2io/gs2-studio-package")
  // The shop sells currency, so the wallet it deposits into comes from the
  // currency package. An install does not walk a package's own dependencies,
  // so the base package is named here too.
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")

  // A browser cannot complete a real store purchase, so the demo's store takes
  // the test receipt the client sends. The shipped package keeps rejecting it.
  .instance(currency.type("CurrencyStore"), "currencystore", {
    [currency.propertyId("CurrencyStore", "enableFakeReceipt")]: "Accept",
  })
  .build();
