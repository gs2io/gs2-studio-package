import { Bind, defineDomainType, definePackage, PT, Source, transactionSetting } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Profile = defineDomainType("Profile", dt =>
  dt
    .property(PT.string("publicProfile").userData())
    .property(PT.string("followerProfile").userData())
    .property(PT.string("friendProfile").userData())
    .localizedProperties({
      id: jaEnId("プロフィール", "profile"),
      publicProfile: jaEnField(
        "公開プロフィール",
        "Public profile",
        "すべてのプレイヤーへ公開するプロフィール情報です。",
        "Profile information visible to every player."
      ),
      followerProfile: jaEnField(
        "フォロワー向けプロフィール",
        "Follower profile",
        "フォロワーへ公開するプロフィール情報です。",
        "Profile information visible to followers."
      ),
      friendProfile: jaEnField(
        "フレンド向けプロフィール",
        "Friend profile",
        "フレンドへ公開するプロフィール情報です。",
        "Profile information visible to friends."
      ),
    })
);

const Follow = defineDomainType("Follow", dt =>
  dt
    .property(PT.string("publicProfile").userData())
    .property(PT.string("followerProfile").userData())
    .localizedProperties({
      id: jaEnId("フォロー関係", "follow relationship"),
      publicProfile: jaEnField(
        "公開プロフィール",
        "Public profile",
        "フォロー相手の公開プロフィール情報です。",
        "Public profile information of the followed player."
      ),
      followerProfile: jaEnField(
        "フォロワー向けプロフィール",
        "Follower profile",
        "フォロワーとして閲覧できるプロフィール情報です。",
        "Profile information visible because the player is a follower."
      ),
    })
);

const Friend = defineDomainType("Friend", dt =>
  dt
    .property(PT.string("publicProfile").userData())
    .property(PT.string("friendProfile").userData())
    .localizedProperties({
      id: jaEnId("フレンド関係", "friend relationship"),
      publicProfile: jaEnField(
        "公開プロフィール",
        "Public profile",
        "フレンドの公開プロフィール情報です。",
        "Public profile information of the friend."
      ),
      friendProfile: jaEnField(
        "フレンド向けプロフィール",
        "Friend profile",
        "フレンドとして閲覧できるプロフィール情報です。",
        "Profile information visible because the players are friends."
      ),
    })
);

// Request records expose the other player id without the profile payload, so they use separate types.
const SendFriendRequest = defineDomainType("SendFriendRequest", dt =>
  dt.localizedProperties({
    id: jaEnId("送信フレンド申請", "outgoing friend request"),
  })
);

const ReceiveFriendRequest = defineDomainType("ReceiveFriendRequest", dt =>
  dt.localizedProperties({
    id: jaEnId("受信フレンド申請", "incoming friend request"),
  })
);

const notificationConfig = {
  enable: Bind.static("Enabled"),
  enableTransferMobileNotification: Bind.static(false),
  gatewayNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:gateway:default"),
  sound: Bind.static(""),
};

export const foundationSocialGraph = definePackage("foundation-social-graph", "0.0.0")
  .display({
    label: { ja: "フレンド・プロフィール", en: "Friends & Profile" },
    description: {
      ja: "フレンド申請・フォロー・プロフィールなど、プレイヤー同士のつながりを扱います。",
      en: "Handles friend requests, follows, and profiles: the connections between players.",
    },
  })
  .displayType(Follow, {
    label: { ja: "フォロー", en: "Follow" },
    description: {
      ja: "プレイヤーがフォローしている相手との関係を管理します。プロフィールはフォロー一覧から取得します。フォロワー一覧はありません。",
      en: "Tracks the players followed by a player. Profiles come from the follow list. There is no follower list.",
    },
  })
  .displayType(Friend, {
    label: { ja: "フレンド", en: "Friend" },
    description: {
      ja: "承認済みのフレンド関係を管理します。プロフィールはフレンド一覧から取得します。",
      en: "Tracks confirmed friendship relationships between players. Profiles come from the friend list.",
    },
  })
  .displayType(Profile, {
    label: { ja: "プロフィール", en: "Profile" },
    description: {
      ja: "プレイヤーが公開するプロフィール情報を管理します。",
      en: "Manages the profile information a player shares with others.",
    },
  })
  .displayType(ReceiveFriendRequest, {
    label: { ja: "フレンド申請（受信）", en: "Incoming friend request" },
    description: {
      ja: "他のプレイヤーから受け取ったフレンド申請を管理します。申請元のプロフィールは含みません。",
      en: "Tracks friend requests received from other players. Requests carry no sender profile.",
    },
  })
  .displayType(SendFriendRequest, {
    label: { ja: "フレンド申請（送信）", en: "Outgoing friend request" },
    description: {
      ja: "他のプレイヤーへ送信したフレンド申請を管理します。申請先のプロフィールは含みません。",
      en: "Tracks friend requests sent to other players. Requests carry no recipient profile.",
    },
  })
  .domainType(Profile)
  .domainType(Follow)
  .domainType(Friend)
  .domainType(SendFriendRequest)
  .domainType(ReceiveFriendRequest)

  .masterDataResource(r =>
    r.model(GS2.friend.Namespace).bindings({
      name: Bind.static("Friend"),
      ...Bind.nulls(
        "logSetting",
        "followScript",
        "unfollowScript",
        "sendRequestScript",
        "cancelRequestScript",
        "acceptRequestScript",
        "rejectRequestScript",
        "deleteFriendScript",
        "updateProfileScript",
        "followNotification"
      ),
      receiveRequestNotification: { ...notificationConfig },
      cancelRequestNotification: { ...notificationConfig },
      acceptRequestNotification: { ...notificationConfig },
      rejectRequestNotification: { ...notificationConfig },
      deleteFriendNotification: { ...notificationConfig },
      transactionSetting: transactionSetting(),
    })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.Profile)
      .mountLocal(Profile)
      .bindings({
        followerProfile: Bind.domainProperties([Source.direct(Profile, "followerProfile")]),
        friendProfile: Bind.domainProperties([Source.direct(Profile, "friendProfile")]),
        profileId: Bind.skip(),
        publicProfile: Bind.domainProperties([Source.direct(Profile, "publicProfile")]),
        userId: Bind.skip(),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.FriendUser)
      .mountLocal(Friend)
      .bindings({
        friendProfile: Bind.domainProperties([Source.direct(Friend, "friendProfile")]),
        publicProfile: Bind.domainProperties([Source.direct(Friend, "publicProfile")]),
        userId: Bind.domainProperty(Source.direct(Friend, "id")),
        // The bound profile fields require profiles to be included in loader results.
        withProfile: Bind.static(true),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.FollowUser)
      .mountLocal(Follow)
      .bindings({
        followerProfile: Bind.domainProperties([Source.direct(Follow, "followerProfile")]),
        publicProfile: Bind.domainProperties([Source.direct(Follow, "publicProfile")]),
        userId: Bind.domainProperty(Source.direct(Follow, "id")),
        // The bound profile fields require profiles to be included in loader results.
        withProfile: Bind.static(true),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.SendFriendRequest)
      .mountLocal(SendFriendRequest)
      .bindings({
        publicProfile: Bind.skip(),
        targetUserId: Bind.domainProperty(Source.direct(SendFriendRequest, "id")),
        userId: Bind.skip(),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.ReceiveFriendRequest)
      .mountLocal(ReceiveFriendRequest)
      .bindings({
        publicProfile: Bind.skip(),
        targetUserId: Bind.skip(),
        userId: Bind.domainProperty(Source.direct(ReceiveFriendRequest, "id")),
      })
  )

  .build();
