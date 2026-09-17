// Buying, as this demo does it.
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
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Gs2Showcase.Model;
using Gs2.Unity.Util;

using GS2Studio.Generated.CurrencyType;
using GS2Studio.Generated.Runtime;
using GS2Studio.Generated.StorePrice;
using GS2Studio.Generated.StoreProduct;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Buys the product this row shows, in the demo's currency, into the demo's
    /// wallet, with a test receipt.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire
    /// and an `OnCompleted` to raise — because that is what the page knows how
    /// to draw, and this is a row like any other once it is drawn.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Buy This Product")]
    public sealed class StoreProductBuyButton : MonoBehaviour
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
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the purchase has committed. The wallet reads its balance
        /// through its own handler, which has no way to know an unrelated
        /// component just moved it.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the purchase fails with a GS2 error, which is what the
        /// page knows how to show. Anything else goes to the page as text —
        /// see <see cref="Report"/>, and why it has to.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private IGs2RuntimeContextProvider? _runtime;
        private ShowroomPage? _page;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<StoreProductHandlerBase>();
            if (_button == null || _wired) return;
            _button.onClick.AddListener(OnClicked);
            _wired = true;
        }

        private void OnDisable()
        {
            if (_button == null || !_wired) return;
            _button.onClick.RemoveListener(OnClicked);
            _wired = false;
        }

        private async void OnClicked()
        {
            try
            {
                await Buy();
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                _onFailed.Invoke(error, null);
                Debug.LogError($"StoreProductBuyButton: purchase failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                Report($"Purchase failed: {error.Message}");
                Debug.LogError($"StoreProductBuyButton: purchase failed: {error}", this);
                return;
            }
            _onCompleted.Invoke();
        }

        private async Task Buy()
        {
            var product = _handler?.Binder?.Id;
            if (product == null)
            {
                // The row has no product yet, which is not a failure to report:
                // the handler raises `Bound` when it has one, and a click that
                // early is a click on a row that is still arriving.
                return;
            }

            _runtime ??= FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (_runtime == null || !_runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                Report("The GS2 runtime context is not available.");
                return;
            }

            // The price is the product paired with a currency, and the shop has
            // no list of prices to have drawn a row from — its display items
            // hang off the showcase rather than off a model that enumerates —
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
        }

        /// <summary>
        /// Put a failure where a visitor can see it.
        ///
        /// The page's error channel carries a `Gs2Exception`, so a failure of
        /// any other kind cannot travel it — and a browser hides the console,
        /// which is where it would otherwise be the only record. The very
        /// failure this demo hit first was one of those.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
