// Keep these copies identical: each standalone demo compiles its own purchase button.
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
    [AddComponentMenu("GS2 Studio/Showroom/Buy This Product")]
    public sealed class StoreProductBuyButton : ShowroomPressButton
    {
        private const string DemoCurrency = "XXX";

        private const int WalletSlot = 0;

        // The platform purchase needs its store product identifier in addition to the GS2 product identity.
        private static string PlatformProduct(string product) => $"io.gs2.demo.shop.{product}";

        [SerializeField] private StoreProductHandlerBase? _handler;

        protected override string PressName => "purchase";

        protected override void OnEnable()
        {
            if (_handler == null) _handler = GetComponentInParent<StoreProductHandlerBase>();
            base.OnEnable();
        }

        // Give purchase failures explicit text because a prefab's baked page-log listener may have no live target.
        protected override string? Explain(Gs2Exception error) =>
            $"Purchase refused: {ShowroomErrors.Describe(error)}";

        protected override async Task<string> Press()
        {
            var product = _handler?.Binder?.Id;
            if (product == null) return "This product is still loading; try again in a moment.";
            if (!ShowroomRuntime.TryGet(out var gs2, out var session)) return "Not signed in yet.";

            // The product row does not select a currency; construct the price binder from the product and the demo currency.
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
