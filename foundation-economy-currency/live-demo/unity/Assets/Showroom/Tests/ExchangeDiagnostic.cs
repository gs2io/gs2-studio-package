// Play-mode reproduction of the demo's delegated action.
//
// The WebGL player reports only the innermost frame of a failure: the await
// rethrow discards everything above it. Running the same call in the editor
// keeps the whole exception chain, so this is where the deposit path is
// diagnosed.
//
// The showroom host boots itself through RuntimeInitializeOnLoadMethod, which
// also runs under the test runner, so this test rides the host's client and
// session rather than standing up a second one — `Gs2ClientHolder` destroys
// duplicate instances on Awake.
#nullable disable
using System;
using System.Collections;
using Gs2.Unity.Util;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace GS2Studio.Showroom.Tests
{
    public sealed class ExchangeDiagnostic
    {
        private const string RateNamespace = "CurrencyGrant";
        private const string RateName = "freedeposit";
        private const string WalletNamespace = "Currency";
        private const int WalletSlot = 0;
        private const int DepositAmount = 100;
        private const float TimeoutSeconds = 60f;

        [UnityTest]
        public IEnumerator FreeDepositExchangeReportsItsFailure()
        {
            yield return WaitUntil(
                () => Gs2ClientHolder.Instance != null && Gs2ClientHolder.Instance.Initialized,
                "GS2 client did not initialize"
            );
            yield return WaitUntil(
                () => Gs2GameSessionHolder.Instance != null && Gs2GameSessionHolder.Instance.Initialized,
                "the page did not sign in"
            );

            var gs2 = Gs2ClientHolder.Instance.Gs2;
            var session = Gs2GameSessionHolder.Instance.GameSession;
            Debug.Log($"[diagnostic] signed in as {session.UserId}");

            var wallet = gs2.Money2.Namespace(WalletNamespace).Me(session).Wallet(WalletSlot);
            var before = wallet.ModelFuture();
            yield return before;
            Assert.That(before.Error, Is.Null, "reading the wallet failed");
            var balanceBefore = before.Result?.Summary?.Free ?? 0;
            Debug.Log($"[diagnostic] free balance before: {balanceBefore}");

            // Deliberately no config: `DepositFreeCurrency` maps slot to the
            // `#{slot}` placeholder, and the SDK replays that request to update
            // its cache. Reading the unsubstituted placeholder must not throw.
            var exchange = new Gs2Bind.Gs2Exchange.RateModelLoader(RateNamespace, RateName).Exchange(
                gs2,
                session,
                1,
                null
            );

            var deadline = Time.realtimeSinceStartup + TimeoutSeconds;
            while (!exchange.IsCompleted && Time.realtimeSinceStartup < deadline) yield return null;
            Assert.That(exchange.IsCompleted, Is.True, "the exchange never completed");

            if (exchange.Exception != null)
            {
                Report(exchange.Exception, 0);
                Assert.Fail("exchange failed; see the diagnostic log above");
                yield break;
            }
            Debug.Log("[diagnostic] exchange completed without error");

            // The point of the fix is not that the call stops throwing but that
            // the cache update completes, so the client sees the new balance
            // without refetching it.
            var after = wallet.ModelFuture();
            yield return after;
            Assert.That(after.Error, Is.Null, "re-reading the wallet failed");
            var balanceAfter = after.Result?.Summary?.Free ?? 0;
            Debug.Log($"[diagnostic] free balance after: {balanceAfter}");
            Assert.That(
                balanceAfter,
                Is.EqualTo(balanceBefore + DepositAmount),
                "the deposit did not reach the client's model"
            );
        }

        private static void Report(Exception exception, int depth)
        {
            if (exception == null || depth > 8) return;
            var indent = new string(' ', depth * 2);
            Debug.LogError($"[diagnostic] {indent}{exception.GetType().FullName}: {exception.Message}");
            Debug.LogError($"[diagnostic] {indent}stack:\n{exception.StackTrace}");
            if (exception is AggregateException aggregate)
            {
                foreach (var inner in aggregate.InnerExceptions) Report(inner, depth + 1);
                return;
            }
            Report(exception.InnerException, depth + 1);
        }

        private static IEnumerator WaitUntil(Func<bool> condition, string failureMessage)
        {
            var deadline = Time.realtimeSinceStartup + TimeoutSeconds;
            while (!condition() && Time.realtimeSinceStartup < deadline) yield return null;
            Assert.That(condition(), Is.True, failureMessage);
        }
    }
}
