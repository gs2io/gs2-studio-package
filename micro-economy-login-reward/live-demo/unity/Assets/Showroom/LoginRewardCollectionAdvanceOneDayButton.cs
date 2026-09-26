// Advancing the player's clock a day, as this demo does it.
//
// The login reward hands out one day per day, at 15:00 UTC, and a visitor
// does not wait a week to see day seven. GS2 keeps a time offset on each
// account that the server adds to "now" for every request the account's
// access token signs, so the demo moves that offset forward 24 hours and the
// next Receive lands on the next day.
//
// No package action sets the offset — it is an account setting, not game
// state — and the Ez SDK has no call for it, so this press goes through the
// core SDK's `UpdateTimeOffset`. The shared client may not make that call;
// this demo signs in with its own (`live-demo/client-stack.yaml`), whose
// policy allows it.
//
// The offset travels in the access token, which is issued at sign-in, so the
// session signs in again once the account has the new offset. The token's
// own `TimeOffset` is left alone: the SDK reads it as part of the session's
// identity, and the account sign-in never fills it, so it stays null and the
// page's subscriptions keep their key.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Gs2Account.Request;
using Gs2.Unity.Util;
using Gs2Bind.Gs2Account;

using GS2Studio.Generated.Runtime;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Moves the signed-in player's clock on GS2 forward one day.
    ///
    /// Shaped like a generated action button on purpose — a `Button` to wire,
    /// an `OnCompleted` to raise and an `OnFailed` to report through — because
    /// that is what the page knows how to draw.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Advance One Day")]
    public sealed class LoginRewardCollectionAdvanceOneDayButton : MonoBehaviour
    {
        private const int OneDaySeconds = 24 * 60 * 60;

        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the account has the new offset and the session has
        /// signed in with it.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when GS2 refuses the new offset. Anything else goes to the
        /// page as text; see <see cref="Report"/>.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private bool _wired;
        private bool _running;
        private IGs2RuntimeContextProvider? _runtime;
        private Gs2AutoLoginAction? _login;
        private ShowroomPage? _page;

        private void OnEnable()
        {
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
            // Two presses before the first returns would both read the same
            // stored offset and move the clock one day, not two.
            if (_running) return;
            _running = true;
            if (_button != null) _button.interactable = false;
            try
            {
                if (await Advance()) _onCompleted.Invoke();
            }
            finally
            {
                _running = false;
                if (_button != null) _button.interactable = true;
            }
        }

        /// <summary>Whether the clock moved and the session caught up with it.</summary>
        private async Task<bool> Advance()
        {
            _runtime ??= FindAnyObjectByType<Gs2HolderRuntimeContextProvider>();
            if (_runtime == null || !_runtime.TryGet(out var gs2, out var session) ||
                gs2 == null || session == null)
            {
                Report("The GS2 runtime context is not available.");
                return false;
            }

            _login ??= FindAnyObjectByType<Gs2AutoLoginAction>();
            if (_login == null || string.IsNullOrEmpty(_login.accountNamespace))
            {
                Report("The scene names no account namespace to advance the clock in.");
                return false;
            }

            var userId = session.UserId;
            var next = (long)DemoTimeOffset.Get(userId) + OneDaySeconds;
            if (next > DemoTimeOffset.MaxSeconds)
            {
                Report("The demo clock is already as far ahead as GS2 allows (ten years).");
                return false;
            }

            try
            {
                await gs2.Super.Account
                    .Namespace(_login.accountNamespace)
                    .Account(userId)
                    .UpdateTimeOffsetAsync(new UpdateTimeOffsetRequest().WithTimeOffset((int)next));
            }
            catch (Gs2Exception error)
            {
                // A click has nothing to resume from, so no retry is offered.
                _onFailed.Invoke(error, null);
                Debug.LogError($"{nameof(LoginRewardCollectionAdvanceOneDayButton)}: advancing failed: {error}", this);
                return false;
            }
            catch (Exception error)
            {
                Report($"Advancing the clock failed: {error.Message}");
                Debug.LogError($"{nameof(LoginRewardCollectionAdvanceOneDayButton)}: advancing failed: {error}", this);
                return false;
            }

            // The account has the new offset whatever happens next, so it is
            // stored before the session is refreshed.
            DemoTimeOffset.Set(userId, (int)next);

            try
            {
                await session.RefreshAsync();
            }
            catch (Exception error)
            {
                Report(
                    "The clock moved forward a day, but signing in again failed, so this page " +
                    "still runs on the old time. Reload the page: the next sign-in carries the new offset.");
                Debug.LogError($"{nameof(LoginRewardCollectionAdvanceOneDayButton)}: refreshing the session failed: {error}", this);
                return false;
            }
            return true;
        }

        /// <summary>
        /// Put a message where a visitor can see it: a browser hides the
        /// console, and the page's error channel carries only a `Gs2Exception`.
        /// </summary>
        private void Report(string message)
        {
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
