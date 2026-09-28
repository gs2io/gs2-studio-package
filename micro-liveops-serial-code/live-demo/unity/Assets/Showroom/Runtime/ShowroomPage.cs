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
using Gs2.Core.Model;
using Gs2.Util.LitJson;
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
            SetStatus("Connecting…");
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
        /// <see cref="Describe"/>'s full reading of it. That is the right way
        /// round — the second line is the better one, and its absence is now
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
                : line.Substring(0, MirroredLineLength) + "…";
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
            // `Describe` reads an error body the SDK left unparsed, which is by
            // definition a shape nothing here has seen. A throw in it would be
            // swallowed by the event that called this and take the whole line
            // with it, so the reading is allowed to fail and the type name
            // stands in — the one thing the page must not do is print nothing.
            string described;
            try
            {
                described = Describe(error);
            }
            catch (System.Exception failure)
            {
                described = error == null
                    ? $"the action failed, and reading the failure failed too: {failure.Message}"
                    : $"{error.GetType().Name} (reading it failed: {failure.Message})";
            }
            Log(described);
        }

        /// <summary>
        /// What a failure says on the page, which is never nothing.
        ///
        /// `Gs2Exception.Errors` is the server's own account of what went wrong
        /// and is the right thing to show — but the SDK fills it by parsing the
        /// exception's message as that list, and there is a whole class of
        /// failure whose message is not one. A namespace that commits
        /// atomically runs its actions server-side and reports a refused one
        /// through the transaction result, which the SDK raises as an exception
        /// carrying that action's own result body
        /// (`RanTransactionAccessTokenDomain.HandleResult`) or as
        /// `UnknownException("Ran transaction failed.")`. Neither parses, so
        /// `Errors` comes back empty and joining it wrote a blank line: a
        /// refused count-up reached this page as a timestamp and nothing else,
        /// which reads exactly like the press having done nothing.
        ///
        /// So the list is used when the SDK filled one, the body is unwrapped
        /// the way the SDK's own HTTP path unwraps it when it did not, and the
        /// exception's type names the failure when even that says nothing.
        /// </summary>
        private static string Describe(Gs2Exception error)
        {
            if (error == null) return "the action failed and said nothing about why";
            var reported = Joined(error.Errors);
            if (reported.Length > 0) return reported;
            var unwrapped = Unwrap(error.Message);
            return unwrapped.Length > 0 ? $"{error.GetType().Name}: {unwrapped}" : error.GetType().Name;
        }

        /// <summary>The messages a `RequestError[]` carries, as one line.</summary>
        private static string Joined(RequestError[] errors)
        {
            if (errors == null) return "";
            return string.Join(
                ", ",
                errors
                    .Where(entry => entry != null && !string.IsNullOrEmpty(entry.Message))
                    .Select(entry => entry.Message));
        }

        /// <summary>
        /// The readable part of an error body the SDK left unparsed.
        ///
        /// GS2 wraps its error list in `{"message": "<the list, as a string>"}`,
        /// and an action inside a transaction is reported by handing that whole
        /// envelope over rather than the list inside it. Unwrapping is
        /// therefore a loop: an object with a string `message` is one layer,
        /// and an array of them is the list itself. Anything else is handed
        /// back as it came, because a body this cannot read is still more than
        /// a blank line.
        /// </summary>
        private static string Unwrap(string body)
        {
            if (string.IsNullOrEmpty(body)) return "";
            var text = body.Trim();
            // Bounded rather than `while (true)`: the shapes above nest twice at
            // most, and a body that keeps unwrapping is malformed.
            for (var depth = 0; depth < 4; depth++)
            {
                JsonData parsed;
                try
                {
                    parsed = JsonMapper.ToObject(text);
                }
                catch (System.Exception)
                {
                    return text;
                }
                if (parsed == null) return text;
                if (parsed.IsArray)
                {
                    var messages = new List<string>();
                    for (var i = 0; i < parsed.Count; i++)
                    {
                        var entry = parsed[i];
                        if (entry == null || !entry.IsObject) continue;
                        if (!entry.Keys.Contains("message")) continue;
                        if (entry["message"] == null || !entry["message"].IsString) continue;
                        messages.Add((string)entry["message"]);
                    }
                    return messages.Count > 0 ? string.Join(", ", messages) : text;
                }
                if (parsed.IsObject &&
                    parsed.Keys.Contains("message") &&
                    parsed["message"] != null &&
                    parsed["message"].IsString)
                {
                    text = ((string)parsed["message"]).Trim();
                    continue;
                }
                return text;
            }
            return text;
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
