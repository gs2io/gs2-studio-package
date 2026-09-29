// The name of the other player on a friend request row.
//
// A friend request carries only the other player's id: GS2 returns no profile
// with it. So this reads that player's public profile through the SDK and
// watches it in the SDK's cache. GS2 does not say when another player edits
// their profile, so the name is as fresh as the SDK's cache of it.
#nullable enable

using System;
using System.Collections.Concurrent;

using UnityEngine;
using UnityEngine.Events;

using Gs2.Gs2Friend.Domain.Model;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>Publishes the name of the player this row shows.</summary>
    public abstract class FriendRowNameLabel : MonoBehaviour
    {
        [SerializeField] private UnityEvent<string> _onUpdate = new UnityEvent<string>();

        public UnityEvent<string> OnUpdate => _onUpdate;

        /// <summary>The name this label last showed; null until it has shown one.</summary>
        public string? Shown { get; private set; }

        /// <summary>The other player's id, read from the row; null while the row is still arriving.</summary>
        protected abstract string? RowUserId();

        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();
        private string? _userId;
        private int _ticket;
        private Action? _unsubscribe;

        private void OnDisable()
        {
            Stop();
            _userId = null;
            Shown = null;
        }

        private void Update()
        {
            while (_inbox.TryDequeue(out var apply)) apply();
            var userId = RowUserId();
            if (string.IsNullOrEmpty(userId) || userId == _userId) return;
            _userId = userId;
            Show(FriendDemo.Tag(userId));
            Watch(userId!);
        }

        private void Show(string name)
        {
            Shown = name;
            _onUpdate.Invoke(name);
        }

        private void Stop()
        {
            _ticket++;
            var unsubscribe = _unsubscribe;
            _unsubscribe = null;
            unsubscribe?.Invoke();
        }

        private async void Watch(string userId)
        {
            Stop();
            if (!FriendDemo.TryRuntime(out var gs2, out _)) return;
            var ticket = _ticket;
            var profile = gs2!.Super.Friend.Namespace(FriendDemo.Namespace).User(userId).PublicProfile();
            try
            {
                var id = await profile.SubscribeWithInitialCallAsync(model => _inbox.Enqueue(() =>
                {
                    if (ticket == _ticket && model != null) Show(FriendDemo.NameOf(userId, model.Value));
                }));
                if (ticket == _ticket && this != null) _unsubscribe = () => profile.Unsubscribe(id);
                else profile.Unsubscribe(id);
            }
            catch (Exception error)
            {
                // The tag stays; a name is a nicety on this row.
                Debug.LogWarning($"{GetType().Name}: the public profile of {userId} could not be read: {error.Message}");
            }
        }
    }
}
