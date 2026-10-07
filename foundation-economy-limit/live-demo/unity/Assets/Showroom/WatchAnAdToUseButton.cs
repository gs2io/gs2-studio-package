// Grant the view before the exchange because the exchange consumes an already-banked point; these calls are not one atomic transaction.
// Create the generated components under the content mount at runtime so rebaking cannot leave stale Inspector references.
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
    [AddComponentMenu("GS2 Studio/Showroom/Watch An Ad To Use")]
    public sealed class WatchAnAdToUseButton : MonoBehaviour
    {
        private const string Body =
            AdBreakOverlay.MissingPlacementBody + "\n\n" +
            "The button below tells GS2 the view finished, then spends the point on one use of " +
            "this allowance, in one transaction. A shipped title starts this from its ad " +
            "network's completion callback.";

        private const string ReadyStatus = "The placement has finished.";
        private const string GrantingStatus = "Asking GS2 for the view...";
        private const string ExchangingStatus = "Spending it on this allowance...";

        /// <summary>Runtime rows must wire both generated serialized button fields; report a missing field instead of leaving an inert press.</summary>
        private static readonly FieldInfo? WatchButtonField =
            typeof(AdViewPointWatchButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        private static readonly FieldInfo? UseButtonField =
            typeof(UsageLimitCounterUseWithAdButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        [SerializeField] private Button? _button;

        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>Forward failures from either call so visitors can see refusals without the browser console.</summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private AdViewPointWatchButton? _watch;
        private UsageLimitCounterUseWithAdButton? _use;

        /// <summary>Use a hidden trigger to enter the generated action through its button contract without adding another visible row.</summary>
        private Button? _useTrigger;

        private AdBreakOverlay? _overlay;

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

            // Keep both components below their handler mounts so parent lookup resolves each owner.
            _watch = gameObject.AddComponent<AdViewPointWatchButton>();
            WatchButtonField.SetValue(_watch, _overlay.ConfirmButton);

            _use = gameObject.AddComponent<UsageLimitCounterUseWithAdButton>();
            UseButtonField.SetValue(_use, _useTrigger);

            // Re-enable after assigning buttons because AddComponent already called OnEnable before they were wired.
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

        /// <summary>Closing the panel must not start either grant or exchange.</summary>
        private void Close()
        {
            _busy = false;
            _overlay?.Close();
        }

        private void OnConfirmed()
        {
            if (_busy) return;
            _busy = true;
            _overlay?.SetBusy(GrantingStatus);
        }

        /// <summary>Enter through the generated button so the exchange retains its in-flight guard and failure event.</summary>
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

        /// <summary>Close the overlay before reporting failure so it cannot cover the page log.</summary>
        private void OnFailedHalf(Gs2Exception error, Func<IEnumerator>? retry)
        {
            Close();
            _onFailed.Invoke(error, retry);
        }

        /// <summary>Keep wiring instructions intact; the ordinary console mirror truncates them.</summary>
        private void Report(string message) => ShowroomLog.SayWhole(message, this);
    }
}
