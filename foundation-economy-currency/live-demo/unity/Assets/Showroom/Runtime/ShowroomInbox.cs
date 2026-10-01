// Handing what the SDK says over to the main thread.
//
// POLICY: hand-written showroom code never touches Unity from an SDK callback.
// A subscription callback, a notification, or the continuation of an SDK call
// awaited outside Unity's synchronization context only posts to an inbox; the
// owning behaviour drains the inbox in `Update` and draws there.
//
// Why: outside WebGL the SDK's websocket receives on its own thread and
// dispatches a notification synchronously from it, and the SDK's cache calls
// its subscribers on whichever thread wrote to the cache. Whether every path
// from a notification to a callback returns to the main thread first is not
// something this code can rely on, and Unity objects (a `Text`, a
// `GameObject`, `FindAnyObjectByType`, `Time`) must not be touched from any
// other thread. WebGL is single-threaded, so a published demo would not show
// the fault, but the Editor's Play Mode would, intermittently.
//
// It also batches: everything that arrived since the last frame is applied
// first, and the region is drawn once afterwards rather than per callback.
//
// `ShowroomWatch` posts here for its subscriptions; anything else an SDK
// callback wants done is posted with `Post`.
#nullable enable

using System;
using System.Collections.Concurrent;

using UnityEngine;

namespace GS2Studio.Showroom
{
    /// <summary>A queue of work for the main thread, filled from any thread.</summary>
    public sealed class ShowroomInbox
    {
        private readonly ConcurrentQueue<Action> _queue = new ConcurrentQueue<Action>();

        /// <summary>Queues <paramref name="apply"/> for the next <see cref="Drain"/>. Any thread.</summary>
        public void Post(Action apply)
        {
            if (apply == null) throw new ArgumentNullException(nameof(apply));
            _queue.Enqueue(apply);
        }

        /// <summary>
        /// Runs everything queued, in order, and returns whether anything ran,
        /// so the owner knows whether to draw. A throw in one item is logged
        /// and does not hold up the rest. Main thread only.
        /// </summary>
        public bool Drain()
        {
            var ran = false;
            while (_queue.TryDequeue(out var apply))
            {
                ran = true;
                try
                {
                    apply();
                }
                catch (Exception error)
                {
                    Debug.LogException(error);
                }
            }
            return ran;
        }

        /// <summary>Drops everything queued without running it, for an owner that stops.</summary>
        public void Clear()
        {
            while (_queue.TryDequeue(out _)) { }
        }
    }
}
