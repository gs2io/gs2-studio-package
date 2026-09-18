// Paying for the coins a draw costs, as this demo does it.
//
// The coins come from the shop, bought the way the shop demo buys them: the
// generated `Buy` on a store price buys through the platform's store and hands
// GS2 the receipt that comes back. Away from a real storefront the platform
// answers from its fake store, and the demo's Money2 namespace is set to
// accept what that returns. This is the shop demo's behaviour, repeated here
// because each demo is a Unity project of its own.
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
    /// wallet, with a test receipt. The shop demo's press, carried here so a
    /// visitor can afford a draw.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Buy This Product")]
    public sealed class StoreProductBuyButton : MonoBehaviour
    {
        /// <summary>The currency the demo prices everything in.</summary>
        private const string DemoCurrency = "XXX";

        /// <summary>The demo shows one player with one wallet, slot 0 — the one the gacha draws from.</summary>
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
        /// page knows how to show. Anything else goes to the page as text.
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

        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
