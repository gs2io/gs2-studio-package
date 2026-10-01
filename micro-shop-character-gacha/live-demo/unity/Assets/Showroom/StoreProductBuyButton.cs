// Buying, as these demos do it.
//
// The shop's purchase is a delegated action on a store price, and a store
// price is a product paired with a currency. The page lists products, because
// that is what the shop has a list of; which currency a visitor is buying in
// is the demo's choice, not the shop's, so the row does not carry it.
//
// The shipped purchase is an in-app one, and the demo makes it the way it is
// made: the generated `Buy` buys through the platform's store and hands GS2
// the receipt that comes back. Nothing here writes a receipt. Away from a real
// storefront the platform answers from its fake store, and the demo's Money2
// namespace is set to accept what that returns.
//
// What the demo does supply is what only it can. Which product to buy in the
// platform's store is an identifier registered there rather than in GS2, and
// which wallet the currency lands in is the buyer's choice — a store sells to
// whichever wallet is named.
//
// This file is in two demos, byte for byte: each demo is a Unity project of
// its own, and the shop's purchase is what both of them need. A gate holds the
// copies equal, because a press that drifts between them is a press that only
// one visitor gets.
#nullable enable

using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Unity.Gs2Showcase.Model;

using GS2Studio.Generated.CurrencyType;
using GS2Studio.Generated.StorePrice;
using GS2Studio.Generated.StoreProduct;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Buys the product this row shows, in the demo's currency, into the demo's
    /// wallet, with a test receipt.
    ///
    /// A press like any other on the page (`ShowroomPressButton`): it waits its
    /// turn with every other press, and the button stays off while a purchase
    /// is out, so one click buys once. Nothing is read again afterwards; the
    /// wallet's generated labels follow the SDK's cache and move by themselves.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Buy This Product")]
    public sealed class StoreProductBuyButton : ShowroomPressButton
    {
        /// <summary>
        /// The currency the demo prices everything in. The shop sells in three;
        /// a page that offered all of them would be showing the shop's
        /// configurability rather than its purchase.
        /// </summary>
        private const string DemoCurrency = "XXX";

        /// <summary>The demo shows one player with one wallet, slot 0.</summary>
        private const int WalletSlot = 0;

        /// <summary>
        /// The product as the platform's store knows it. A shipped title
        /// registers these in App Store Connect and Play Console; the demo
        /// names one per product so the fake store has something to answer for.
        /// </summary>
        private static string PlatformProduct(string product) => $"io.gs2.demo.shop.{product}";

        [SerializeField] private StoreProductHandlerBase? _handler;

        protected override string PressName => "purchase";

        protected override void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<StoreProductHandlerBase>();
            base.OnEnable();
        }

        /// <summary>
        /// Every refusal is said here, in the purchase's terms. This row lives
        /// in a list item prefab, where the `OnFailed` listener the page
        /// builder bakes has no page to call, so a refusal handed to it would
        /// be said nowhere.
        /// </summary>
        protected override string? Explain(Gs2Exception error) =>
            $"Purchase refused: {ShowroomErrors.Describe(error)}";

        protected override async Task<string> Press()
        {
            var product = _handler?.Binder?.Id;
            // The handler raises `Bound` when it has a product; a click before
            // that is a click on a row that is still arriving.
            if (product == null) return "This product is still loading; try again in a moment.";
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";

            // The price is the product paired with a currency, and the shop has
            // no list of prices to have drawn a row from (its display items
            // hang off the showcase rather than off a model that enumerates),
            // so the row's product and the demo's currency name one here. The
            // binder is what knows the id that pair composes to.
            var price = await StorePriceBinder.CreateAsync(
                product.Value, new CurrencyTypeId(DemoCurrency), gs2, session);
            using (price)
            {
                await price.Buy(
                    PlatformProduct(product.Value.ToString()),
                    new[] { new EzConfig { Key = "slot", Value = WalletSlot.ToString() } });
            }
            return "Purchased.";
        }
    }
}
