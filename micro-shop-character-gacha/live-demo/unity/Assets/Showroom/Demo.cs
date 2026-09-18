// Drawing, and paying for the coins it costs, as this demo does them.
//
// The gacha is sold through a showcase, and the feature package delegates
// `Buy` on the gacha to that display item: the generated binder carries the
// press, and the draw's cost and prizes are the package's master data. What
// the package does not carry is a button, because a package cannot put a
// button on an action another package declared; so the demo presses `Buy`
// from a behaviour of its own, and the row is drawn like any other.
//
// The coins come from the shop, bought the way the shop demo buys them: the
// generated `Buy` on a store price buys through the platform's store and hands
// GS2 the receipt that comes back. Away from a real storefront the platform
// answers from its fake store, and the demo's Money2 namespace is set to
// accept what that returns. That behaviour is the shop demo's, repeated here
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
using GS2Studio.Generated.Gacha;
using GS2Studio.Generated.Runtime;
using GS2Studio.Generated.StorePrice;
using GS2Studio.Generated.StoreProduct;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Draws once from the gacha this row shows.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire
    /// and an `OnCompleted` to raise — because that is what the page knows how
    /// to draw. The draw's cost leaves the wallet and its prize lands in the
    /// roster, and both read their own handlers, which is what `OnCompleted`
    /// is for.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Draw This Gacha")]
    public sealed class GachaBuyButton : MonoBehaviour
    {
        /// <summary>One pull per press. The showcase sells the draw by count.</summary>
        private const int DrawsPerPress = 1;

        [SerializeField] private GachaHandlerBase? _handler;
        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the draw has committed. The wallet and the roster read
        /// through their own handlers, which have no way to know an unrelated
        /// component just moved them.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the draw fails with a GS2 error, which is what the page
        /// knows how to show. Anything else goes to the page as text — see
        /// <see cref="Report"/>, and why it has to.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private ShowroomPage? _page;

        private void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<GachaHandlerBase>();
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
                await Draw();
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                _onFailed.Invoke(error, null);
                Debug.LogError($"GachaBuyButton: draw failed: {error}", this);
                return;
            }
            catch (Exception error)
            {
                Report($"Draw failed: {error.Message}");
                Debug.LogError($"GachaBuyButton: draw failed: {error}", this);
                return;
            }
            _onCompleted.Invoke();
        }

        private async Task Draw()
        {
            var binder = _handler?.Binder;
            if (binder == null)
            {
                // The row has no gacha yet, which is not a failure to report:
                // the handler raises `Bound` when it has one, and a click that
                // early is a click on a row that is still arriving.
                return;
            }
            await binder.Buy(DrawsPerPress);
        }

        /// <summary>
        /// Put a failure where a visitor can see it.
        ///
        /// The page's error channel carries a `Gs2Exception`, so a failure of
        /// any other kind cannot travel it — and a browser hides the console,
        /// which is where it would otherwise be the only record.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }

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
