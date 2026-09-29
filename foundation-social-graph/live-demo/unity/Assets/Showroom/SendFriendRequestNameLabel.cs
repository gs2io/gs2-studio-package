// The name of the player the request this row shows was sent to.
#nullable enable

using UnityEngine;

using GS2Studio.Generated.SendFriendRequest;

namespace GS2Studio.Showroom.Demo
{
    /// <summary>The name of the player the request this row shows was sent to.</summary>
    [AddComponentMenu("GS2 Studio/Showroom/Name On A Sent Friend Request")]
    public sealed class SendFriendRequestNameLabel : FriendRowNameLabel
    {
        protected override string? RowUserId() => GetComponentInParent<SendFriendRequestHandlerBase>()?.Model?.Id.Value;
    }
}
