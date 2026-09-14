// The currency demo.
//
// Money2 keeps two balances — currency granted for free and currency the player
// paid for — and this page exists to show which one moves.
#nullable disable
using System;
using Gs2.Unity.Gs2Exchange.Model;
using Gs2Bind.Gs2Exchange;
using GS2Studio.Generated.Wallet;
using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    public static class Demo
    {
        /// <summary>The exchange namespace and rates the demo package deploys.</summary>
        private const string DepositNamespace = "CurrencyGrant";
        private const string FreeRate = "freedeposit";
        private const string PaidRate = "paiddeposit";

        /// <summary>The demo shows one player with one wallet.</summary>
        private const int WalletSlot = 0;

        public static void Build(Transform content, ShowroomPage page)
        {
            var deposits = ShowroomUi.CreateSection(content, "Deposits");
            ShowroomUi.CreateText(
                "Explainer",
                deposits,
                "A free deposit lands in the free balance, the way a reward would. A paid "
                    + "deposit carries a price and a currency, which is what makes Money2 "
                    + "record it against the paid balance.",
                15,
                ShowroomUi.Muted
            );
            ShowroomUi.CreateButton(deposits, "Deposit 100 free", () => Deposit(page, FreeRate, "free"));
            ShowroomUi.CreateButton(deposits, "Deposit 50 paid", () => Deposit(page, PaidRate, "paid"));

            var wallet = ShowroomUi.CreateSection(content, "Wallet");
            var free = ShowroomUi.CreateValueRow(wallet, "Free balance");
            var paid = ShowroomUi.CreateValueRow(wallet, "Paid balance");
            var total = ShowroomUi.CreateValueRow(wallet, "Total balance");

            // The handler owns a WalletBinder and subscribes to it, so every
            // change GS2 pushes arrives here without the page asking again.
            var handler = new GameObject("Wallet").AddComponent<WalletHandler>();
            handler.SetKeys(WalletSlot);
            handler.Updated += model =>
            {
                free.text = model.Free.ToString();
                paid.text = model.Paid.ToString();
                total.text = model.Total.ToString();
            };
            handler.Failed += error => page.Log($"wallet: {error.Message}");
        }

        private static async void Deposit(ShowroomPage page, string rateName, string label)
        {
            page.Log($"depositing to the {label} balance…");
            try
            {
                // The deposit transforms leave the wallet slot as the `#{slot}`
                // placeholder, so the caller names the wallet to credit.
                var config = new[] { new EzConfig { Key = "slot", Value = WalletSlot.ToString() } };
                await new RateModelLoader(DepositNamespace, rateName).Exchange(
                    page.Gs2,
                    page.Session,
                    1,
                    config
                );
                page.Log($"deposited to the {label} balance");
            }
            catch (Exception error)
            {
                page.Log($"deposit failed: {error.Message}");
                Debug.LogException(error);
            }
        }
    }
}
