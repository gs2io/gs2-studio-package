// Saying a repeating failure once, until it stops failing.
//
// Something the page does on a timer (a periodic read, a prediction that
// refreshes) fails the same way every period while the cause lasts, and a
// line per period buries the rest of the log. A latch says the first failure
// on the page and keeps quiet about the rest, with only a console warning each
// time, until a success opens it again; the next failure after that is news
// and is said.
//
// Main thread only.
#nullable enable

using System;

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>Reports a repeating failure once until it succeeds.</summary>
    public sealed class ShowroomLatch
    {
        private bool _reported;

        /// <summary>Whether a failure has been said and no success has come since.</summary>
        public bool Reported => _reported;

        /// <summary>
        /// Says that <paramref name="what"/> failed, unless this latch already
        /// said so since the last success; returns whether it said so.
        /// </summary>
        public bool Fail(string what, Exception? error)
        {
            if (_reported)
            {
                Debug.LogWarning($"[showroom] {what} (again): {error}");
                return false;
            }
            _reported = true;
            ShowroomLog.Failure(what, error);
            return true;
        }

        /// <summary>
        /// Says <paramref name="message"/>, unless this latch already said a
        /// failure since the last success; returns whether it said so.
        /// </summary>
        public bool Fail(string message)
        {
            if (_reported)
            {
                Debug.LogWarning($"[showroom] {message} (again)");
                return false;
            }
            _reported = true;
            ShowroomLog.Say(message);
            return true;
        }

        /// <summary>Opens the latch: the next failure is said again.</summary>
        public void Succeeded() => _reported = false;
    }
}
