// Create the generated button at runtime under the content mount; rebaking destroys authored references into that mount.
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

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Ad Break")]
    public sealed class AdBreakButton : MonoBehaviour
    {
        private const string Body =
            AdBreakOverlay.MissingPlacementBody + "\n\n" +
            "The button below tells GS2 the view finished and takes the point. GS2 does not " +
            "verify it; a shipped title presses this from its ad network's completion callback.";

        private const string ReadyStatus = "The placement has finished.";
        private const string GrantingStatus = "Asking GS2 for the point...";

        /// <summary>Runtime rows must wire the generated serialized button field; report a missing field instead of leaving an inert press.</summary>
        private static readonly FieldInfo? GeneratedButtonField =
            typeof(AdViewPointWatchButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        [SerializeField] private Button? _button;

        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>Forward failures to the page so visitors can see refusals without opening the browser console.</summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private AdViewPointWatchButton? _watch;
        private AdBreakOverlay? _overlay;

        private bool _granting;

        private void Start()
        {
            if (_button == null)
            {
                Report("The ad break has no button to open it; the page did not bake this row.");
                return;
            }

            if (GeneratedButtonField == null)
            {
                Report(
                    "The generated watch button no longer takes its press from `_button`, so the " +
                    "ad break cannot hand it one. Re-read `AdViewPoint.showroom.json` for the " +
                    "field the `button` role now names.");
                return;
            }

            _overlay = new AdBreakOverlay(_button, Body, ReadyStatus);

            // Keep the component below the content mount so its parent lookup finds the handler.
            _watch = gameObject.AddComponent<AdViewPointWatchButton>();
            GeneratedButtonField.SetValue(_watch, _overlay.ConfirmButton);

            // Re-enable after assigning the button because AddComponent already called OnEnable before it was wired.
            _watch.enabled = false;
            _watch.enabled = true;

            _watch.OnCompleted.AddListener(OnGranted);
            _watch.OnFailed.AddListener(OnGrantFailed);

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
                _watch.OnFailed.RemoveListener(OnGrantFailed);
            }
            if (_overlay != null) _overlay.Destroy();
        }

        private void Update()
        {
            if (_granting) return;
            _overlay?.Tick();
        }

        private void Open()
        {
            if (_overlay == null || _overlay.IsOpen) return;
            _granting = false;
            _overlay.Open();
        }

        /// <summary>Closing the panel must not invoke the grant button.</summary>
        private void Close()
        {
            _granting = false;
            _overlay?.Close();
        }

        private void OnConfirmed()
        {
            if (_granting) return;
            _granting = true;
            _overlay?.SetBusy(GrantingStatus);
        }

        private void OnGranted()
        {
            Close();
            _onCompleted.Invoke();
        }

        private void OnGrantFailed(Gs2Exception error, Func<IEnumerator>? retry)
        {
            Close();
            _onFailed.Invoke(error, retry);
        }

        /// <summary>Keep wiring instructions intact; the ordinary console mirror truncates them.</summary>
        private void Report(string message) => ShowroomLog.SayWhole(message, this);
    }
}
