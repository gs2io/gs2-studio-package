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

        /// <summary>
        /// Set while the mirror below is writing, so a line it writes cannot
        /// bring it straight back in.
        /// </summary>
        private bool _mirroring;

        private void Start()
        {
            SetStatus("Connecting...");
        }

        /// <summary>
        /// Puts everything Unity logs as a failure on the page as well.
        ///
        /// Every other route to this log is a wire: a generated button raises
        /// `OnFailed`, a persistent listener the page builder baked calls
        /// <see cref="LogError"/>, and that writes a line. Each of those links
        /// can be absent — a listener whose target method the managed linker
        /// dropped, an event whose generic instantiation the AOT compiler never
        /// made, a `LogError` that threw before it wrote anything — and every
        /// one of them fails the same way, by the page saying nothing while the
        /// browser console says plenty. A visitor cannot open that console.
        ///
        /// So the console is copied here instead, and the page stops depending
        /// on any single wire being intact. It is deliberately not filtered to
        /// this demo's own messages: an error from the SDK, from a generated
        /// component, or from Unity itself is all the same thing to a visitor
        /// looking at a page that did not do what they asked.
        ///
        /// A failure the wire *does* carry arrives twice: once as the console's
        /// own first line, cut short by <see cref="FirstLine"/>, and once as
        /// <see cref="ShowroomErrors.Describe"/>'s full reading of it. That is
        /// the right way round — the second line is the better one, and its absence is now
        /// itself visible on the page rather than only in a console nobody has
        /// open.
        /// </summary>
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
            // Re-entrant only in the sense that a line written from here could
            // produce another log; the flag covers that. It is not what makes
            // this safe on its own — an exception leaving this handler is
            // logged by Unity and arrives back here with the flag already put
            // down, which is a loop rather than a re-entry. So nothing is
            // allowed out.
            if (_mirroring) return;
            _mirroring = true;
            try
            {
                Log(FirstLine(condition));
            }
            catch (System.Exception)
            {
                // Swallowed, and there is nowhere to say so: a page that cannot
                // write to its log has no second log to report that in, and
                // anything said here would be said by throwing.
            }
            finally
            {
                _mirroring = false;
            }
        }

        /// <summary>How much of a console message the page carries.</summary>
        private const int MirroredLineLength = 200;

        private static readonly char[] LineBreaks = { '\n', '\r' };

        /// <summary>
        /// What of a console message goes on the page: its first line, cut to
        /// <see cref="MirroredLineLength"/>.
        ///
        /// The log holds a bounded number of lines and no bound at all on how
        /// long one is, and a `Text` past a certain size makes the engine log
        /// an error of its own — on every redraw, from a component this cannot
        /// reach, so no guard here would stop it growing. A console message is
        /// exactly the unbounded kind: a stack trace is empty only while the
        /// project asks for traces on explicit throws alone, and turning that
        /// up would bring whole traces through here.
        ///
        /// The first line is also the part worth reading. What a wired failure
        /// says in full arrives on its own line through <see cref="LogError"/>;
        /// this one is the safety net, and a net does not need the detail.
        /// </summary>
        private static string FirstLine(string message)
        {
            if (string.IsNullOrEmpty(message)) return message;
            var breakAt = message.IndexOfAny(LineBreaks);
            var line = breakAt < 0 ? message : message.Substring(0, breakAt);
            return line.Length <= MirroredLineLength
                ? line
                : line.Substring(0, MirroredLineLength) + "...";
        }

        /// <summary>Wire to `Gs2AutoLoginAction.OnAutoLoginComplete`.</summary>
        public void OnSignedIn()
        {
            SetStatus("Connected");
            Log("signed in");
        }

        /// <summary>
        /// Wire to `ShowroomAccountStore`'s `_onSignInFailed`, which passes on
        /// every `Gs2AutoLoginAction.onError` it does not recover from by
        /// replacing a refused saved account. Separate from
        /// <see cref="LogError"/> because this failure means the page itself is
        /// unusable, not that one action did not go through — without it the
        /// status line sits on "Connecting..." forever.
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
            // `Describe` never throws and never returns nothing: it reads an
            // error body nothing here has seen, and a throw out of this would
            // be swallowed by the event that called it and take the line with
            // it.
            Log(ShowroomErrors.Describe(error));
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
