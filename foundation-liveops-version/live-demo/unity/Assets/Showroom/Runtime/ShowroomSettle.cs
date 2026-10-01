// A short pause in presses after what the page shows has moved.
//
// A row that appears or vanishes, a region that is redrawn, or a button whose
// meaning changes moves or repurposes every button below it, and a press in
// that moment may land on a different button, or a different meaning, than
// the visitor aimed at. So whatever changes what the page shows says so here,
// and a press in the next 0.6 seconds is refused with a request to press
// again.
//
// Marking only when something actually changed matters: a mark on every
// redraw would refuse every press. `ShowroomRegion` marks only when what it
// shows differs from what it showed.
//
// One clock for the whole page, because a change anywhere can move a button
// anywhere below it. Main thread only.
#nullable enable

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>Holds presses for a moment after the page moved.</summary>
    public static class ShowroomSettle
    {
        /// <summary>How long after a change a press is refused.</summary>
        public const float Seconds = 0.6f;

        private static float _lastChange = float.NegativeInfinity;

        /// <summary>Says that what the page shows, or what a button on it does, just changed.</summary>
        public static void MarkChanged() => _lastChange = Time.realtimeSinceStartup;

        /// <summary>
        /// Whether a press may go ahead now. When it may not and
        /// <paramref name="say"/> is true, the visitor is told to press again.
        /// </summary>
        public static bool Settled(bool say = true)
        {
            if (Time.realtimeSinceStartup - _lastChange >= Seconds) return true;
            if (say) ShowroomLog.Say("The page just changed; press again.");
            return false;
        }

        /// <summary>Starts every play session settled, with domain reload off or on.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetOnPlay() => _lastChange = float.NegativeInfinity;
    }
}
