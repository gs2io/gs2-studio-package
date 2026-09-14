// What the currency demo's buttons do.
//
// Everything else is in the scene: the wallet's balances are generated label
// components wired to Text in the Inspector, and the deposits themselves are
// exchange rates the demo package deploys. All that is left for code is the
// call a button makes.
#nullable disable
using System;
using Gs2.Unity.Gs2Exchange.Model;
using Gs2Bind.Gs2Exchange;
using Gs2.Unity.Core;
using Gs2.Unity.Util;
using UnityEngine;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Currency Demo")]
    public sealed class Demo : MonoBehaviour
    {
        [SerializeField] private ShowroomPage _page;

        [Header("Exchange")]
        [Tooltip("The exchange namespace the demo package deploys.")]
        [SerializeField] private string _namespaceName = "CurrencyGrant";
        [SerializeField] private string _freeRateName = "freedeposit";
        [SerializeField] private string _paidRateName = "paiddeposit";

        [Header("Wallet")]
        [Tooltip("The deposit transforms leave the wallet slot as a placeholder, so the caller names it.")]
        [SerializeField] private int _walletSlot;

        /// <summary>Wire to a Button's `onClick`.</summary>
        public void DepositFree() => Deposit(_freeRateName, "free");

        /// <summary>Wire to a Button's `onClick`.</summary>
        public void DepositPaid() => Deposit(_paidRateName, "paid");

        private async void Deposit(string rateName, string label)
        {
            _page.Log($"depositing to the {label} balance…");
            try
            {
                var config = new[] { new EzConfig { Key = "slot", Value = _walletSlot.ToString() } };
                await new RateModelLoader(_namespaceName, rateName).Exchange(
                    Gs2ClientHolder.Instance.Gs2,
                    Gs2GameSessionHolder.Instance.GameSession,
                    1,
                    config
                );
                _page.Log($"deposited to the {label} balance");
            }
            catch (Exception error)
            {
                _page.Log($"deposit failed: {error.Message}");
                Debug.LogException(error);
            }
        }
    }
}
