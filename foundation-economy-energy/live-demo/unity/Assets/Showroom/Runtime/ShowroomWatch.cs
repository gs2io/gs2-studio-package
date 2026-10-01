// One subscription to something in the SDK's cache, by ticket.
//
// Starting a watch hands out a ticket; stopping it, or starting it again,
// retires that ticket. Whatever the SDK reports under a retired ticket is
// dropped, and a subscription that finishes starting after its ticket was
// retired is unsubscribed at once. That is what makes it safe to restart a
// watch (on a new target, or after a failure) while the old subscription is
// still being set up.
//
// Everything the SDK hands over goes through the owner's `ShowroomInbox`
// (see the policy there): `Post` queues it, and the ticket is checked again
// when the inbox is drained on the main thread.
//
// What happens when a watch cannot start, or cannot read again:
// - Starting fails: the watch is `Failed`, and the owner starts it again on
//   its own schedule (a periodic tick that looks at `Failed`). The failure is
//   said on the page once per start, from the main thread.
// - Reading again fails: by `RereadFailure`. `Keep` logs a warning and keeps
//   the subscription, which still hears every change; `Restart` fails the
//   watch, so the owner's tick subscribes afresh.
//
// The SDK keeps a list subscription alive across a cache eviction but may
// then call it with an empty list, which reads exactly like "the list is
// empty". So an empty list is read again through the domain before it is
// believed: the domain answers from the cache while the cache holds the list,
// and otherwise asks GS2 and caches the answer, which also tells every
// subscriber. `SubscribeList` does that.
#nullable enable

using System;

using UnityEngine;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

namespace GS2Studio.Showroom
{
    /// <summary>One ticketed subscription.</summary>
    public sealed class ShowroomWatch
    {
        /// <summary>What a failed re-read does to the watch.</summary>
        public enum RereadFailure
        {
            /// <summary>Log a warning and keep the subscription.</summary>
            Keep,

            /// <summary>Fail the watch, so the owner subscribes afresh.</summary>
            Restart,
        }

        private readonly object _gate = new object();
        private readonly ShowroomInbox _inbox;
        private readonly RereadFailure _rereadFailure;
        private int _ticket;
        private bool _running;
        private bool _failed;
        private Action? _unsubscribe;
        private Action? _reread;

        /// <param name="inbox">The owner's inbox, drained in its `Update`.</param>
        /// <param name="rereadFailure">What a failed re-read does.</param>
        /// <param name="what">What is watched, as a phrase for the page ("your friends").</param>
        public ShowroomWatch(ShowroomInbox inbox, RereadFailure rereadFailure, string what)
        {
            _inbox = inbox ?? throw new ArgumentNullException(nameof(inbox));
            _rereadFailure = rereadFailure;
            What = what ?? "";
        }

        /// <summary>What is watched, as a phrase for the page.</summary>
        public string What { get; }

        /// <summary>Started, and neither stopped nor failed since.</summary>
        public bool Running
        {
            get { lock (_gate) return _running; }
        }

        /// <summary>Failed since it was last started; the owner starts it again.</summary>
        public bool Failed
        {
            get { lock (_gate) return _failed; }
        }

        /// <summary>Never started, or stopped.</summary>
        public bool Idle
        {
            get { lock (_gate) return !_running && !_failed; }
        }

        /// <summary>Stops whatever ran before and starts anew; returns the new ticket.</summary>
        public int Start()
        {
            Stop();
            lock (_gate)
            {
                _running = true;
                return _ticket;
            }
        }

        /// <summary>Whether <paramref name="ticket"/> is the running one.</summary>
        public bool Is(int ticket)
        {
            lock (_gate) return _running && ticket == _ticket;
        }

        /// <summary>
        /// Keeps how to unsubscribe, and how to read again, for the running
        /// ticket. For a retired ticket, unsubscribes at once instead.
        /// </summary>
        public void Attach(int ticket, Action unsubscribe, Action? reread = null)
        {
            if (unsubscribe == null) throw new ArgumentNullException(nameof(unsubscribe));
            lock (_gate)
            {
                if (_running && ticket == _ticket)
                {
                    _unsubscribe = unsubscribe;
                    _reread = reread;
                    return;
                }
            }
            unsubscribe();
        }

        /// <summary>Reads again what the watch follows; nothing until it has attached.</summary>
        public void Reread()
        {
            Action? reread;
            lock (_gate) reread = _running ? _reread : null;
            reread?.Invoke();
        }

        /// <summary>
        /// Marks the running ticket failed and returns true; false for a
        /// retired ticket, whose failure nobody is waiting for.
        /// </summary>
        public bool Fail(int ticket)
        {
            Action? unsubscribe;
            lock (_gate)
            {
                if (!_running || ticket != _ticket) return false;
                _running = false;
                _failed = true;
                _reread = null;
                unsubscribe = _unsubscribe;
                _unsubscribe = null;
            }
            unsubscribe?.Invoke();
            return true;
        }

        /// <summary>Retires the ticket and unsubscribes. The watch is idle afterwards.</summary>
        public void Stop()
        {
            Action? unsubscribe;
            lock (_gate)
            {
                _ticket++;
                _running = false;
                _failed = false;
                _reread = null;
                unsubscribe = _unsubscribe;
                _unsubscribe = null;
            }
            unsubscribe?.Invoke();
        }

        /// <summary>
        /// Hands <paramref name="apply"/> to the main thread, to run only if
        /// <paramref name="ticket"/> is still the running one by then.
        /// </summary>
        public void Post(int ticket, Action apply)
        {
            if (apply == null) throw new ArgumentNullException(nameof(apply));
            _inbox.Post(() =>
            {
                if (Is(ticket)) apply();
            });
        }

        /// <summary>
        /// Subscribes to one model. <paramref name="apply"/> runs on the main
        /// thread with every value the SDK reports, including the first.
        /// <paramref name="reread"/>, when given, is what <see cref="Reread"/>
        /// runs: typically the domain's model read, whose answer reaches
        /// <paramref name="apply"/> through the subscription. A failure to
        /// start goes to <paramref name="failed"/> on the main thread, or is
        /// said on the page when none is given.
        /// </summary>
        public async void Subscribe<T>(
            Func<Action<T>, UniTask<ulong>> subscribe,
            Action<ulong> unsubscribe,
            Action<T> apply,
            Func<UniTask>? reread = null,
            Action<Exception>? failed = null)
        {
            var ticket = Start();
            try
            {
                var id = await subscribe(value => Post(ticket, () => apply(value)));
                Attach(ticket, () => unsubscribe(id), reread == null ? null : () => RunReread(ticket, reread));
            }
            catch (Exception error)
            {
                StartFailed(ticket, error, failed);
            }
        }

        /// <summary>
        /// Subscribes to one list. <paramref name="store"/> runs on the main
        /// thread with every list the SDK reports (never null). An empty list
        /// is read again through <paramref name="read"/> before it is
        /// believed (see the header). A failure to start goes to
        /// <paramref name="failed"/> on the main thread, or is said on the
        /// page when none is given.
        /// </summary>
        public async void SubscribeList<T>(
            Func<Action<T[]>, UniTask<ulong>> subscribe,
            Action<ulong> unsubscribe,
            Func<IUniTaskAsyncEnumerable<T>> read,
            Action<T[]> store,
            Action<Exception>? failed = null)
        {
            var ticket = Start();
            void Apply(T[]? items) => Post(ticket, () => store(items ?? Array.Empty<T>()));
            void ReadAgain() => RunReread(ticket, async () => Apply(await read().ToArrayAsync()));
            try
            {
                var id = await subscribe(items =>
                {
                    if (items == null || items.Length == 0) ReadAgain();
                    else Apply(items);
                });
                Attach(ticket, () => unsubscribe(id), ReadAgain);
            }
            catch (Exception error)
            {
                StartFailed(ticket, error, failed);
            }
        }

        private async void RunReread(int ticket, Func<UniTask> reread)
        {
            try
            {
                await reread();
            }
            catch (Exception error)
            {
                switch (_rereadFailure)
                {
                    case RereadFailure.Restart:
                        if (!Fail(ticket)) return;
                        break;
                    default:
                        if (!Is(ticket)) return;
                        break;
                }
                // A warning, not an error: the page mirrors errors, and a
                // watch that is still subscribed, or about to subscribe
                // afresh, has nothing a visitor needs to act on.
                Debug.LogWarning($"[showroom] {What} could not be read again: {error}");
            }
        }

        private void StartFailed(int ticket, Exception error, Action<Exception>? failed)
        {
            if (!Fail(ticket)) return;
            // Checked again when the inbox is drained: a watch restarted (or
            // stopped) in the meantime has retired this ticket, and its
            // failure is no longer news.
            if (failed != null)
            {
                _inbox.Post(() =>
                {
                    if (FailedAt(ticket)) failed(error);
                });
                return;
            }
            var what = What.Length == 0 ? "What this page watches" : char.ToUpperInvariant(What[0]) + What.Substring(1);
            _inbox.Post(() =>
            {
                if (FailedAt(ticket)) ShowroomLog.Failure($"{what} could not be read", error);
            });
        }

        /// <summary>Whether <paramref name="ticket"/> is the one that failed last and nothing has started since.</summary>
        private bool FailedAt(int ticket)
        {
            lock (_gate) return _failed && !_running && ticket == _ticket;
        }
    }
}
