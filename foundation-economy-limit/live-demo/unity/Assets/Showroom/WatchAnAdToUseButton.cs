// The row that earns a view and spends it: an ad break with both halves of an
// ad-backed use behind it.
//
// The break itself is `AdBreakOverlay` — the panel, the wait, and the press
// that stands for an ad network's completion callback. What is here is the two
// things that press sets off, and the order they have to go in.
//
// **The grant cannot be part of the exchange.** GS2 runs a transaction's
// verify actions, then its consume actions, then its acquire actions; a stamp
// sheet's `tasks` are its consumes and its sheet is its acquires, and the SDK
// executes them in that order (`Core/Domain/ManualStampSheetDomain.cs` runs
// `verifyTasks`, then `tasks`, then the sheet). So an exchange that both
// granted a view point and spent one would spend before it granted, and a
// visitor with nothing banked would be refused at the consume and never reach
// the count-up. That is what this row used to do, and from the outside it read
// as watching an ad and having nothing happen.
//
// So it is two round trips, and this row is what holds them in order:
// `AdViewPoint.Watch` grants the point, and only once that has come back does
// the exchange run — one transaction that consumes the point and counts the
// allowance up against the higher of its two ceilings, committed atomically so
// a refused count-up cannot eat the point. The panel stays up across both, so
// what a visitor sees is one ad break.
//
// **The press is only offered where the second half can succeed.** Nothing
// makes a two-part press atomic once the first part has committed, so the page
// hides this row outside the band between the two ceilings
// (`UsageLimitCounterAdUsesUnavailableActiveToggle`). A granted view with
// nothing left to buy is the one failure the exchange cannot protect against,
// and not offering the press is what prevents it.
//
// Built the way the ad demo's own break is built, and for the same reason: the
// page's rows live under the content mount, a re-bake clears that mount, and
// anything authored outside it holding an Inspector reference to a generated
// component goes null on the next bake, silently. So this row adds both
// generated components to its own GameObject at run time — where they resolve
// their handlers by walking up the parent chain, `UsageLimitCounter`'s at the
// section root above it and `AdViewPoint`'s on the page root above that — and
// builds the panel in code. None of it is written to the scene.
//
// Shaped like a generated action button — a `Button` to wire, an
// `OnCompleted`, and the `OnFailed` the page shows failures through — so the
// page draws it as a row like any other.
#nullable enable

using System;
using System.Collections;
using System.Reflection;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

using Gs2.Core.Exception;
using Gs2.Unity.Util;

using GS2Studio.Generated.AdViewPoint.UI;
using GS2Studio.Generated.UsageLimitCounter.UI;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>
    /// Opens a panel that stands in for a rewarded placement; when the visitor
    /// says the placement finished, it banks the view point and then exchanges
    /// it for one use of this allowance.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Watch An Ad To Use")]
    public sealed class WatchAnAdToUseButton : MonoBehaviour
    {
        private const string Body =
            AdBreakOverlay.MissingPlacementBody + "\n\n" +
            "The button below does the half that is not the SDK's, in the two steps GS2 makes of " +
            "it. First it tells GS2 the view was completed and takes the point; GS2 verifies " +
            "nothing, and deciding a view really happened is the title's. Then it exchanges that " +
            "point for one use of this allowance, counted against the higher of its two ceilings " +
            "— one transaction, committed atomically, so a refused count-up cannot spend the " +
            "point. A shipped title starts both from its ad network's completion callback.";

        private const string ReadyStatus = "The placement has finished.";
        private const string GrantingStatus = "Asking GS2 for the view…";
        private const string ExchangingStatus = "Spending it on this allowance…";

        /// <summary>
        /// The fields the two generated buttons take their presses from, named
        /// by the packages' own component manifests —
        /// `AdViewPoint.showroom.json` and `UsageLimitCounter.showroom.json`
        /// each publish `_button` as the `button` role of their action
        /// components, and the page builder writes the same field from the same
        /// manifest when it bakes a generated row. Assigning it is using the
        /// published contract, not reaching into the component; what is missing
        /// is only a setter, because a baked row has no need of one.
        ///
        /// Reflection fails silently by nature, so <see cref="Start"/> refuses
        /// loudly when a field is not there rather than leaving a press that
        /// does nothing.
        /// </summary>
        private static readonly FieldInfo? WatchButtonField =
            typeof(AdViewPointWatchButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        private static readonly FieldInfo? UseButtonField =
            typeof(UsageLimitCounterUseWithAdButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the exchange has gone through. What it changed does not
        /// need it — the count and the conditions that read it arrive through
        /// the binder's own subscription — but a page that wants to hang
        /// something off a completed use has somewhere to hang it.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when either half fails, which is how the page shows it — and
        /// on this row that is the subject rather than an accident. A browser
        /// hides the console, so a refusal a visitor cannot see reads as
        /// nothing having happened.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private AdViewPointWatchButton? _watch;
        private UsageLimitCounterUseWithAdButton? _use;

        /// <summary>
        /// What the second half listens to.
        ///
        /// A generated action component acts on a `Button`'s `onClick` and on
        /// nothing else, so a press raised from code needs a button to raise it
        /// from. This one is never shown and never pressed by anyone: it has no
        /// graphic, no parent — so no layout it could disturb — and exists only
        /// to carry <see cref="OnGranted"/>'s call through the same contract a
        /// baked row's button would.
        /// </summary>
        private Button? _useTrigger;

        private AdBreakOverlay? _overlay;
        private ShowroomPage? _page;

        /// <summary>
        /// True from the confirming press until one of the two halves has
        /// answered. Holds the panel's wait off, and stops a second press
        /// landing on top of a grant that is still out.
        /// </summary>
        private bool _busy;

        private void Start()
        {
            if (_button == null)
            {
                Report("This row has no button to open it; the page did not bake it.");
                return;
            }

            if (WatchButtonField == null || UseButtonField == null)
            {
                Report(
                    "A generated button no longer takes its press from `_button`, so the ad break " +
                    "cannot hand it one. Re-read `AdViewPoint.showroom.json` and " +
                    "`UsageLimitCounter.showroom.json` for the field the `button` role now names.");
                return;
            }

            _overlay = new AdBreakOverlay(_button, Body, ReadyStatus);

            var trigger = new GameObject("AdBackedUsePress", typeof(RectTransform));
            trigger.SetActive(false);
            _useTrigger = trigger.AddComponent<Button>();

            // Both generated components go on this row's own GameObject, which
            // is under the content mount, so each resolves its handler by
            // walking up to it — the same way a baked row's button does.
            _watch = gameObject.AddComponent<AdViewPointWatchButton>();
            WatchButtonField.SetValue(_watch, _overlay.ConfirmButton);

            _use = gameObject.AddComponent<UsageLimitCounterUseWithAdButton>();
            UseButtonField.SetValue(_use, _useTrigger);

            // `AddComponent` already ran each component's `OnEnable`, when it
            // had no button to subscribe to. They only subscribe there, so the
            // press each was just given reaches it on the next enable.
            _watch.enabled = false;
            _watch.enabled = true;
            _use.enabled = false;
            _use.enabled = true;

            _watch.OnCompleted.AddListener(OnGranted);
            _watch.OnFailed.AddListener(OnFailedHalf);
            _use.OnCompleted.AddListener(OnUsed);
            _use.OnFailed.AddListener(OnFailedHalf);

            _overlay.ConfirmButton.onClick.AddListener(OnConfirmed);
            _button.onClick.AddListener(Open);
        }

        private void OnDestroy()
        {
            if (_button != null) _button.onClick.RemoveListener(Open);
            if (_overlay != null) _overlay.ConfirmButton.onClick.RemoveListener(OnConfirmed);
            if (_watch != null)
            {
                _watch.OnCompleted.RemoveListener(OnGranted);
                _watch.OnFailed.RemoveListener(OnFailedHalf);
            }
            if (_use != null)
            {
                _use.OnCompleted.RemoveListener(OnUsed);
                _use.OnFailed.RemoveListener(OnFailedHalf);
            }
            if (_overlay != null) _overlay.Destroy();
            if (_useTrigger != null) Destroy(_useTrigger.gameObject);
        }

        private void Update()
        {
            if (_busy) return;
            _overlay?.Tick();
        }

        private void Open()
        {
            if (_overlay == null || _overlay.IsOpen) return;
            _busy = false;
            _overlay.Open();
        }

        /// <summary>
        /// Puts the panel away. Neither half ever runs from anything but the
        /// confirming press, so no other way out of this panel can bank or
        /// spend a view.
        /// </summary>
        private void Close()
        {
            _busy = false;
            _overlay?.Close();
        }

        /// <summary>
        /// Runs beside the generated watch button's own listener on the same
        /// press: that one asks GS2 for the point, this one says so and stops a
        /// second press landing while the first is still out.
        /// </summary>
        private void OnConfirmed()
        {
            if (_busy) return;
            _busy = true;
            _overlay?.SetBusy(GrantingStatus);
        }

        /// <summary>
        /// The view is banked; now spend it. Raised through the trigger button
        /// rather than called, so the exchange goes through the generated
        /// component that owns it — with its own in-flight guard and its own
        /// failure event — rather than around it.
        /// </summary>
        private void OnGranted()
        {
            _overlay?.SetStatus(ExchangingStatus);
            _useTrigger?.onClick.Invoke();
        }

        private void OnUsed()
        {
            Close();
            _onCompleted.Invoke();
        }

        /// <summary>
        /// Either half failing ends the press. The break is closed first so the
        /// page's log — which is where a refusal is legible — is not behind the
        /// panel that was covering it.
        /// </summary>
        private void OnFailedHalf(Gs2Exception error, Func<IEnumerator>? retry)
        {
            Close();
            _onFailed.Invoke(error, retry);
        }

        /// <summary>
        /// Puts a wiring failure where both a developer and a visitor can see
        /// it. Reflection and a baked reference both fail by being absent, and
        /// a browser hides the console, so neither record is enough on its own.
        ///
        /// The page now mirrors what Unity logs as an error, so the first line
        /// here reaches it on its own and the second is a duplicate — kept on
        /// purpose, because the mirror cuts a message to its first 200
        /// characters and these are repair instructions that name a file and a
        /// field. The one message on this page that must arrive whole is this
        /// one, so it is also sent the way that does not shorten it.
        /// </summary>
        private void Report(string message)
        {
            Debug.LogError($"{nameof(WatchAnAdToUseButton)} on '{name}': {message}", this);
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
