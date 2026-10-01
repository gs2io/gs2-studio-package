// The page's log, for what a demo writes by hand.
//
// A browser hides the console, so whatever a visitor should know goes to the
// `ShowroomPage` log. When a scene has no page (a demo scene opened on its
// own), the line goes to the console as a warning instead of nowhere.
//
// One failure is one line on the page. The detail a developer needs (the
// exception, its stack) goes to the console as a warning, which the page does
// not mirror; only errors are mirrored, and a failure logged as an error would
// reach the page twice.
//
// Main thread only: writing a line redraws a `Text`. Code running in an SDK
// callback hands its line over through `ShowroomInbox` first.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>Writes lines to the page's log.</summary>
    public static class ShowroomLog
    {
        private static ShowroomPage? _page;

        /// <summary>
        /// Puts one line on the page, or in the console when there is no page.
        /// Nothing is written for a null or empty message, so a press with
        /// nothing to say can return "".
        /// </summary>
        public static void Say(string? message)
        {
            if (string.IsNullOrEmpty(message)) return;
            var page = Page();
            if (page != null) page.Log(message!);
            else Debug.LogWarning($"[showroom] {message}");
        }

        /// <summary>
        /// Puts a message on the page whole, and logs it as an error as well.
        ///
        /// For the one kind of message that must reach both a visitor and a
        /// developer intact: a wiring failure whose text says what to repair.
        /// The page mirrors console errors, but cut to their first line and
        /// 200 characters, so the error alone would arrive shortened; this
        /// line is the whole of it, and the mirrored one is a known duplicate.
        /// </summary>
        public static void SayWhole(string? message, UnityEngine.Object? context = null)
        {
            if (string.IsNullOrEmpty(message)) return;
            Debug.LogError(message, context);
            var page = Page();
            if (page != null) page.Log(message!);
        }

        /// <summary>
        /// Says that <paramref name="what"/> failed, in one line a visitor can
        /// read (<see cref="ShowroomErrors.Describe"/>), and puts the whole
        /// exception in the console as a warning.
        /// </summary>
        public static void Failure(string what, Exception? error)
        {
            Debug.LogWarning($"[showroom] {what}: {error}");
            Say($"{what}: {ShowroomErrors.Describe(error)}");
        }

        private static ShowroomPage? Page()
        {
            // Not `??=`: that tests C# null, and a page destroyed with its
            // scene is only null by Unity's own comparison.
            if (_page == null) _page = UnityEngine.Object.FindAnyObjectByType<ShowroomPage>();
            return _page;
        }
    }
}
