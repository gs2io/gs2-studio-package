#nullable enable

using UnityEngine;

using GS2Studio.Generated.SendFriendRequest;

namespace GS2Studio.Showroom.Demo
{
    [AddComponentMenu("GS2 Studio/Showroom/Name On A Sent Friend Request")]
    public sealed class SendFriendRequestNameLabel : FriendRowNameLabel
    {
        protected override string? RowUserId() => GetComponentInParent<SendFriendRequestHandlerBase>()?.Model?.Id.Value;
    }
}
