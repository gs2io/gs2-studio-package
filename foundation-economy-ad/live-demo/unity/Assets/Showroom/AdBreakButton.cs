// The row that banks a view: an ad break, and the grant on the far side of it.
//
// The break itself is `AdBreakOverlay` — the panel, the wait, and the press
// that stands for an ad network's completion callback. What is here is the
// other half, which is GS2's: `Gs2AdReward:AcquirePointByUserId` takes a
// namespace, a user and a number of points, and verifies nothing. Deciding
// that a view really happened belongs to the title, between the two, and this
// row is that decision spelled out — because a visitor who cannot tell a mock
// from the real thing has been misled rather than shown something.
//
// How it is built matters as much as what it says. The page's rows live under
// the content mount, and a re-bake clears that mount and re-creates every
// generated component on it — so anything placed outside the mount that holds
// an Inspector reference to a generated component goes null the next time the
// page is baked, silently. This row therefore owns the whole break: it adds
// the generated `AdViewPointWatchButton` to its own GameObject at run time,
// where the generated component finds the handler by walking up to the mount
// on its own, and the panel is built in code. Nothing of either is written to
// the scene or to a prefab, so a re-bake has nothing to break.
//
// Shaped like a generated action button on purpose — a `Button` to wire and
// an `OnCompleted` to raise, plus the `OnFailed` the page shows failures
// through — because that is what the page knows how to draw, and this is a
// row like any other once it is drawn.
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
    /// <summary>
    /// Opens a panel that stands in for a rewarded placement, and grants the
    /// view point when the visitor says the placement finished.
    /// </summary>
    [AddComponentMenu("GS2 Studio/Showroom/Ad Break")]
    public sealed class AdBreakButton : MonoBehaviour
    {
        private const string Body =
            AdBreakOverlay.MissingPlacementBody + "\n\n" +
            "The button below does the half that is not the SDK's. It tells GS2 a view was " +
            "completed and asks for the point; GS2 verifies nothing. A shipped title presses it " +
            "from its ad network's completion callback, and that decision is what this panel is " +
            "standing in for.";

        private const string ReadyStatus = "The placement has finished.";
        private const string GrantingStatus = "Asking GS2 for the point…";

        /// <summary>
        /// The field the generated button takes its press from, named by the
        /// package's own component manifest — `AdViewPoint.showroom.json`
        /// publishes it as the `button` role of `AdViewPointWatchButton`, and
        /// the page builder writes the same field from the same manifest when
        /// it bakes a generated row. Assigning it is using the published
        /// contract, not reaching into the component; what is missing is only
        /// a setter, because a baked row has no need of one.
        ///
        /// Reflection fails silently by nature, so <see cref="Start"/> refuses
        /// loudly when the field is not there rather than leaving a press that
        /// does nothing.
        /// </summary>
        private static readonly FieldInfo? GeneratedButtonField =
            typeof(AdViewPointWatchButton).GetField(
                "_button", BindingFlags.Instance | BindingFlags.NonPublic);

        [SerializeField] private Button? _button;

        /// <summary>
        /// Raised once the point has been granted, for a page that wants to
        /// hang something off it. What the grant changed does not need it: the
        /// balance row reads through its own binder's subscription.
        /// </summary>
        [SerializeField] private UnityEvent _onCompleted = new UnityEvent();

        /// <summary>
        /// Raised when the grant fails, which is how the page shows it. A
        /// browser hides the console, so a failure a visitor cannot see reads
        /// as nothing having happened.
        /// </summary>
        [SerializeField] private ErrorEvent _onFailed = new ErrorEvent();

        public UnityEvent OnCompleted => _onCompleted;
        public ErrorEvent OnFailed => _onFailed;

        private AdViewPointWatchButton? _watch;
        private AdBreakOverlay? _overlay;
        private ShowroomPage? _page;

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

            // The generated component goes on this row's own GameObject, which
            // is under the content mount, so it resolves the handler by
            // walking up to it — the same way a baked row's button does.
            _watch = gameObject.AddComponent<AdViewPointWatchButton>();
            GeneratedButtonField.SetValue(_watch, _overlay.ConfirmButton);

            // `AddComponent` already ran the component's `OnEnable`, when it
            // had no button to subscribe to. It only subscribes there, so the
            // press it was just given reaches it on the next enable.
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

        /// <summary>
        /// Puts the panel away without granting anything.
        ///
        /// The grant only ever happens on the generated component's own press,
        /// so no way out of this panel can pay: closing it is closing it.
        /// </summary>
        private void Close()
        {
            _granting = false;
            _overlay?.Close();
        }

        /// <summary>
        /// Runs beside the generated component's own listener on the same
        /// press: that one asks GS2 for the point, this one says so and stops
        /// a second press landing while the first is still out.
        /// </summary>
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
            Debug.LogError($"{nameof(AdBreakButton)} on '{name}': {message}", this);
            _page ??= FindAnyObjectByType<ShowroomPage>();
            if (_page != null) _page.Log(message);
        }
    }
}
