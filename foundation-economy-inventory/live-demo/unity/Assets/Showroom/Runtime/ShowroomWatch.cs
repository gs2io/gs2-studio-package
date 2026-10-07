// Subscription setup can finish after stop or retarget; tickets keep late callbacks from restoring stale state.
#nullable enable

using System;

using UnityEngine;

using Cysharp.Threading.Tasks;
using Cysharp.Threading.Tasks.Linq;

namespace GS2Studio.Showroom
{
    public sealed class ShowroomWatch
    {
        // A failed read need not discard a subscription that still receives cache updates.
        public enum RereadFailure
        {
            Keep,

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

        public ShowroomWatch(ShowroomInbox inbox, RereadFailure rereadFailure, string what)
        {
            _inbox = inbox ?? throw new ArgumentNullException(nameof(inbox));
            _rereadFailure = rereadFailure;
            What = what ?? "";
        }

        public string What { get; }

        public bool Running
        {
            get { lock (_gate) return _running; }
        }

        public bool Failed
        {
            get { lock (_gate) return _failed; }
        }

        public bool Idle
        {
            get { lock (_gate) return !_running && !_failed; }
        }

        public int Start()
        {
            Stop();
            lock (_gate)
            {
                _running = true;
                return _ticket;
            }
        }

        public bool Is(int ticket)
        {
            lock (_gate) return _running && ticket == _ticket;
        }

        // Late attachments must unsubscribe immediately or a retired ticket would leak its subscription.
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

        public void Reread()
        {
            Action? reread;
            lock (_gate) reread = _running ? _reread : null;
            reread?.Invoke();
        }

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

        // A ticket can retire after posting; check it again when the main-thread inbox drains.
        public void Post(int ticket, Action apply)
        {
            if (apply == null) throw new ArgumentNullException(nameof(apply));
            _inbox.Post(() =>
            {
                if (Is(ticket)) apply();
            });
        }

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

        // An empty notification can mean cache eviction; read through the domain before showing an empty list.
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
                // Errors are mirrored onto the page; this recoverable read failure needs only a console warning.
                Debug.LogWarning($"[showroom] {What} could not be read again: {error}");
            }
        }

        private void StartFailed(int ticket, Exception error, Action<Exception>? failed)
        {
            if (!Fail(ticket)) return;
            // The ticket may retire while queued; recheck its failed state before reporting it.
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

        private bool FailedAt(int ticket)
        {
            lock (_gate) return _failed && !_running && ticket == _ticket;
        }
    }
}
