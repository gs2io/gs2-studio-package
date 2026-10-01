// The name of the other player on a friend request row.
//
// A friend request carries only the other player's id: GS2 returns no profile
// with it. So this reads that player's public profile through the SDK and
// watches it in the SDK's cache. GS2 does not say when another player edits
// their profile, so the name is as fresh as the SDK's cache of it. What the
// SDK reports reaches the label through its `ShowroomInbox`, drained in
// `Update`.
#nullable enable


using UnityEngine;
using UnityEngine.Events;

using PublicProfile = Gs2.Gs2Friend.Model.PublicProfile;

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

        private readonly ShowroomInbox _inbox = new ShowroomInbox();
        private ShowroomWatch? _watch;
        private string? _userId;

        private void OnDisable()
        {
            _watch?.Stop();
            _inbox.Clear();
            _userId = null;
            Shown = null;
        }

        private void Update()
        {
            _inbox.Drain();
            var userId = RowUserId();
            if (string.IsNullOrEmpty(userId) || userId == _userId) return;
            if (!ShowroomRuntime.TryGet(out var gs2, out _)) return;
            _userId = userId;
            Show(ShowroomPlayerTag.Of(userId));
            var profile = gs2.Super.Friend.Namespace(FriendDemo.Namespace).User(userId!).PublicProfile();
            _watch ??= new ShowroomWatch(_inbox, ShowroomWatch.RereadFailure.Keep, "a player's public profile");
            _watch.Subscribe<PublicProfile>(
                callback => profile.SubscribeWithInitialCallAsync(callback),
                profile.Unsubscribe,
                model =>
                {
                    if (model != null) Show(FriendDemo.NameOf(userId!, model.Value));
                },
                // The tag stays; a name is a nicety on this row.
                failed: error => Debug.LogWarning($"[showroom] {GetType().Name}: the public profile of {userId} could not be read: {error}"));
        }

        private void Show(string name)
        {
            Shown = name;
            _onUpdate.Invoke(name);
        }
    }
}
