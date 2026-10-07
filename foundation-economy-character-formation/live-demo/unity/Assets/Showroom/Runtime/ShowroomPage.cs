#nullable disable
using System;
using System.Collections;
using System.Collections.Generic;
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

        private bool _mirroring;

        private void Start()
        {
            SetStatus("Connecting...");
        }

        // Mirror failures even when a broken event wire prevents LogError from reaching this page.
        // A wired failure may appear twice; losing unwired failures would leave the page silent.
        private void OnEnable()
        {
            Application.logMessageReceived += OnUnityLogged;
        }

        private void OnDisable()
        {
            Application.logMessageReceived -= OnUnityLogged;
        }

        private void OnUnityLogged(string condition, string stackTrace, LogType type)
        {
            if (type != LogType.Error && type != LogType.Exception && type != LogType.Assert) return;
            // Guard nested logs and absorb exceptions: Unity would log an escaped exception again.
            if (_mirroring) return;
            _mirroring = true;
            try
            {
                Log(FirstLine(condition));
            }
            catch (System.Exception)
            {
                // Logging this failure would re-enter the mirror that just failed.
            }
            finally
            {
                _mirroring = false;
            }
        }

        private const int MirroredLineLength = 200;

        private static readonly char[] LineBreaks = { '\n', '\r' };

        // Unbounded messages can make Unity Text report its own errors, feeding the mirror again.
        private static string FirstLine(string message)
        {
            if (string.IsNullOrEmpty(message)) return message;
            var breakAt = message.IndexOfAny(LineBreaks);
            var line = breakAt < 0 ? message : message.Substring(0, breakAt);
            return line.Length <= MirroredLineLength
                ? line
                : line.Substring(0, MirroredLineLength) + "...";
        }

        public void OnSignedIn()
        {
            SetStatus("Connected");
            Log("signed in");
        }

        // A sign-in failure leaves the whole page unusable; LogError alone leaves Connecting visible.
        public void OnSignInFailed(Gs2Exception error, Func<IEnumerator> retry)
        {
            SetStatus("Sign-in failed");
            LogError(error, retry);
        }

        // The SDK event supplies a retry callback, but this page has no retry control.
        public void LogError(Gs2Exception error, Func<IEnumerator> retry)
        {
            // Formatting must not throw and lose the failure message at the event boundary.
            Log(ShowroomErrors.Describe(error));
        }

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
