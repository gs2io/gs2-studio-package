// Running one press at a time, for the whole page.
//
// A press is an action a visitor asked for, that talks to GS2 and answers in
// words. Every hand-written press goes through `Run`, so they all behave
// alike:
//
// - One at a time across the page. A second press while one is out is
//   refused with "One moment..." rather than queued or silently dropped:
//   two presses at once would race on the same state, and a press that does
//   nothing visible reads as a broken button.
// - Held for a moment after the page moved (`ShowroomSettle`).
// - The outcome is said in the page's log: the line the action returns, or
//   the refusal in the press's own terms (`Explain`), or GS2's reading of it
//   (`ShowroomErrors.Describe`). One line per press.
// - Nothing is read again afterwards. What a press changed reaches every
//   reader through the SDK's cache, which the generated binders and the
//   hand-written watches subscribe to; reading again only throws that cache
//   away (and duplicates list rows).
//
// Main thread only. The action's continuations return to the main thread
// through Unity's synchronization context, so callbacks run there too.
#nullable enable

using System;
using System.Threading.Tasks;

using UnityEngine;

using Gs2.Core.Exception;
using Gs2.Unity.Core;
using Gs2.Unity.Util;

namespace GS2Studio.Showroom
{
    /// <summary>Runs presses one at a time and says their outcome.</summary>
    public static class ShowroomPress
    {
        private static bool _busy;
        private static bool _frozen;

        /// <summary>Whether a press is out now.</summary>
        public static bool Busy => _busy;

        /// <summary>
        /// Refuses every press from now on: the page is about to reload (for
        /// example as another account), and a press now would act for the
        /// account it is leaving.
        /// </summary>
        public static void Freeze() => _frozen = true;

        /// <summary>
        /// Starts <paramref name="action"/> with the signed-in player's SDK
        /// handles, unless a press is already out, the page just changed, or
        /// nobody is signed in yet; each of those is said on the page when a
        /// visitor pressed. The action returns the line the page says ("" for
        /// none). Returns whether the press started.
        /// </summary>
        public static bool Run(ShowroomPressOptions options, Func<Gs2Domain, IGameSession, Task<string>> action)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            if (action == null) throw new ArgumentNullException(nameof(action));
            if (_frozen)
            {
                if (options.Pressed) ShowroomLog.Say("The page is reloading.");
                return false;
            }
            if (_busy)
            {
                if (options.Pressed) ShowroomLog.Say("One moment: the last press is still going.");
                return false;
            }
            if (options.Pressed && !ShowroomSettle.Settled()) return false;
            if (!ShowroomRuntime.TryGet(out var gs2, out var session))
            {
                if (options.Pressed) ShowroomLog.Say("Not signed in yet.");
                return false;
            }
            _busy = true;
            Execute(options, gs2, session, action);
            return true;
        }

        private static async void Execute(ShowroomPressOptions options, Gs2Domain gs2, IGameSession session, Func<Gs2Domain, IGameSession, Task<string>> action)
        {
            string? line = null;
            Gs2Exception? unexplained = null;
            var gone = false;
            try
            {
                line = await action(gs2, session);
            }
            catch (Gs2Exception error)
            {
                Debug.LogWarning($"[showroom] {options.Name} refused: {(options.Redact ? ShowroomErrors.Summary(error) : error.ToString())}");
                gone = error is NotFoundException;
                line = Explained(options, error);
                if (line == null)
                {
                    if (options.Unexplained != null) unexplained = error;
                    else line = Unexplainable(options, error);
                }
            }
            catch (Exception error)
            {
                // The type only when redacted: the message of an unexpected
                // failure may carry what the request carried.
                Debug.LogWarning($"[showroom] {options.Name} failed: {(options.Redact ? error.GetType().Name : error.ToString())}");
                line = options.Redact ? $"Failed: {error.GetType().Name}" : $"Failed: {ShowroomErrors.Describe(error)}";
            }
            finally
            {
                _busy = false;
            }

            // An owner that was given and has since been destroyed compares
            // equal to null by Unity's rules while the reference is not null.
            var ownerGone = !ReferenceEquals(options.Owner, null) && options.Owner == null;
            // A refusal meant for the owner's `Unexplained` is said here
            // instead once the owner is gone, so it is still said once.
            if (ownerGone && unexplained != null) line = Unexplainable(options, unexplained);
            // Guarded like the callbacks: a line that fails to draw must not
            // keep `Afterward` from turning the buttons back on.
            Guarded(options, () => ShowroomLog.Say(line));
            if (ownerGone) return;
            if (unexplained != null) Guarded(options, () => options.Unexplained!(unexplained));
            if (gone && options.WhenGone != null) Guarded(options, options.WhenGone);
            if (options.Afterward != null) Guarded(options, options.Afterward);
        }

        /// <summary>The runner's own reading of a refusal nothing explained.</summary>
        private static string Unexplainable(ShowroomPressOptions options, Gs2Exception error) =>
            options.Redact ? $"GS2 refused: {ShowroomErrors.Summary(error)}" : ShowroomErrors.Describe(error);

        /// <summary>The press's own line for a refusal, or null; an Explain that throws explains nothing.</summary>
        private static string? Explained(ShowroomPressOptions options, Gs2Exception error)
        {
            if (options.Explain == null) return null;
            try
            {
                return options.Explain(error);
            }
            catch (Exception failure)
            {
                Debug.LogWarning($"[showroom] {options.Name}: explaining a refusal failed: {failure}");
                return null;
            }
        }

        /// <summary>
        /// Runs one callback so that a throw in it neither skips the next one
        /// nor leaves an `async void` with an unobserved exception.
        /// </summary>
        private static void Guarded(ShowroomPressOptions options, Action callback)
        {
            try
            {
                callback();
            }
            catch (Exception failure)
            {
                try
                {
                    ShowroomLog.Failure($"After {options.Name}, the page could not update", failure);
                }
                catch (Exception)
                {
                    // The page's log is what failed; the console still has the warning.
                    Debug.LogWarning($"[showroom] After {options.Name}, the page could not update: {failure}");
                }
            }
        }

        /// <summary>Starts every play session idle, with domain reload off or on.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay()
        {
            _busy = false;
            _frozen = false;
        }
    }
}
