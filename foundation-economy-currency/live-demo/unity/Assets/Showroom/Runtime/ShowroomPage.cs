// The page's status line and log.
//
// Everything visible is authored in the scene, and everything that reads GS2
// is a generated handler wired in the Inspector. What is left for code is the
// two things a scene cannot express: the running commentary of a live demo,
// and turning a sign-in result into a status a visitor can read.
//
// The sign-in itself belongs to `Gs2AutoLoginAction`, whose events this
// listens to — which is also how a game would do it.
#nullable disable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Gs2.Core.Exception;
using UnityEngine;
using UnityEngine.UI;

namespace GS2Studio.Showroom
{
    [AddComponentMenu("GS2 Studio/Showroom/Showroom Page")]
    public sealed class ShowroomPage : MonoBehaviour
    {
        private const int MaximumLogLines = 120;

        [SerializeField] private Text _statusText;
        [SerializeField] private Text _logText;
        [SerializeField] private ScrollRect _logScroll;

        private readonly List<string> _lines = new List<string>();

        private void Start()
        {
            SetStatus("Connecting…");
        }

        /// <summary>Wire to `Gs2AutoLoginAction.OnAutoLoginComplete`.</summary>
        public void OnSignedIn()
        {
            SetStatus("Connected");
            Log("signed in");
        }

        /// <summary>
        /// Wire to `Gs2AutoLoginAction.onError`. Separate from
        /// <see cref="LogError"/> because this failure means the page itself is
        /// unusable, not that one action did not go through — without it the
        /// status line sits on "Connecting…" forever.
        /// </summary>
        public void OnSignInFailed(Gs2Exception error, Func<IEnumerator> retry)
        {
            SetStatus("Sign-in failed");
            LogError(error, retry);
        }

        /// <summary>
        /// Wire to a generated button action's `OnFailed`. The browser hides
        /// the console, so a failure a visitor cannot see is a failure that
        /// looks like nothing happening.
        ///
        /// `retry` comes with the SDK's error-event shape; the demo offers no
        /// way to ask for one, so it only reports what went wrong.
        /// </summary>
        public void LogError(Gs2Exception error, Func<IEnumerator> retry)
        {
            Log(string.Join(", ", error.Errors.Select(entry => entry.Message)));
        }

        /// <summary>Writes one line to the on-screen log. WebGL hides the console.</summary>
        public void Log(string message)
        {
            _lines.Add($"[{System.DateTime.Now:HH:mm:ss}] {message}");
            if (_lines.Count > MaximumLogLines) _lines.RemoveAt(0);
            if (_logText == null) return;
            _logText.text = string.Join("\n", _lines);
            Canvas.ForceUpdateCanvases();
            if (_logScroll != null) _logScroll.verticalNormalizedPosition = 0f;
        }

        private void SetStatus(string status)
        {
            if (_statusText != null) _statusText.text = status;
        }
    }
}
