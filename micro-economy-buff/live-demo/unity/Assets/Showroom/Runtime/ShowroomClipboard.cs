// The browser clipboard, for a page's Copy and Paste buttons.
//
// Only a WebGL player has a browser to ask (`ShowroomClipboard.jslib`).
// Anywhere else (the Editor's Play Mode) Unity's own clipboard stands in, so
// the buttons still do something.
//
// This is the raw request. A panel uses `ShowroomClipboardRequest`, which
// adds the deadline, the one-request-at-a-time rule and the callbacks.
#nullable enable

#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>
    /// One clipboard request at a time. <see cref="Copy"/> and
    /// <see cref="Paste"/> start one; <see cref="Poll"/> reports it once it is
    /// settled.
    /// </summary>
    public static class ShowroomClipboard
    {
        public enum Outcome
        {
            Waiting,
            Done,
            Refused,
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void ShowroomClipboardCopy(string text);
        [DllImport("__Internal")] private static extern void ShowroomClipboardPaste();
        [DllImport("__Internal")] private static extern int ShowroomClipboardStatus();
        [DllImport("__Internal")] private static extern string ShowroomClipboardTake();
        [DllImport("__Internal")] private static extern void ShowroomClipboardAbandon();

        /// <summary>Gives up on the request in flight; a late answer to it is dropped.</summary>
        public static void Abandon() => ShowroomClipboardAbandon();

        public static void Copy(string text) => ShowroomClipboardCopy(text);

        public static void Paste() => ShowroomClipboardPaste();

        /// <summary>
        /// The outcome, with the pasted text or the browser's reason for
        /// refusing; <see cref="Outcome.Waiting"/> until then.
        /// </summary>
        public static Outcome Poll(out string text)
        {
            text = "";
            switch (ShowroomClipboardStatus())
            {
                case 2:
                    text = ShowroomClipboardTake();
                    return Outcome.Done;
                case 3:
                    text = ShowroomClipboardTake();
                    return Outcome.Refused;
                default:
                    return Outcome.Waiting;
            }
        }
#else
        private static Outcome _outcome = Outcome.Waiting;
        private static string _text = "";

        public static void Copy(string text)
        {
            GUIUtility.systemCopyBuffer = text;
            _outcome = Outcome.Done;
            _text = "";
        }

        public static void Paste()
        {
            _text = GUIUtility.systemCopyBuffer ?? "";
            _outcome = Outcome.Done;
        }

        public static void Abandon()
        {
            _outcome = Outcome.Waiting;
            _text = "";
        }

        public static Outcome Poll(out string text)
        {
            text = _text;
            var outcome = _outcome;
            _outcome = Outcome.Waiting;
            _text = "";
            return outcome;
        }
#endif
    }
}
