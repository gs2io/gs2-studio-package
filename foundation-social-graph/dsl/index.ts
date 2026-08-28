import { Bind, definePackage, defineDomainType, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const Profile = defineDomainType("Profile", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("publicProfile").userData())
    .property(PT.string("followerProfile").userData())
    .property(PT.string("friendProfile").userData())
);

const Follow = defineDomainType("Follow", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("publicProfile").userData())
    .property(PT.string("followerProfile").userData())
);

const Friend = defineDomainType("Friend", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("publicProfile").userData())
    .property(PT.string("friendProfile").userData())
);

const SendFriendRequest = defineDomainType("SendFriendRequest", dt =>
  dt.idDescription("Unique identifier").property(PT.string("targetPublicProfile").userData())
);

const ReceiveFriendRequest = defineDomainType("ReceiveFriendRequest", dt =>
  dt.idDescription("Unique identifier").property(PT.string("fromPublicProfile").userData())
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
      en: "Handles friend requests, follows, and profiles — the connections between players.",
    },
  })
  .displayType(Follow, {
    label: { ja: "フォロー", en: "Follow" },
    description: {
      ja: "プレイヤーがフォローしている相手との関係を管理します。",
      en: "Tracks the players followed by a player.",
    },
  })
  .displayType(Friend, {
    label: { ja: "フレンド", en: "Friend" },
    description: {
      ja: "承認済みのフレンド関係を管理します。",
      en: "Tracks confirmed friendship relationships between players.",
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
      ja: "他のプレイヤーから受け取ったフレンド申請を管理します。",
      en: "Tracks friend requests received from other players.",
    },
  })
  .displayType(SendFriendRequest, {
    label: { ja: "フレンド申請（送信）", en: "Outgoing friend request" },
    description: {
      ja: "他のプレイヤーへ送信したフレンド申請を管理します。",
      en: "Tracks friend requests sent to other players.",
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
      logSetting: Bind.null(),
      followScript: Bind.null(),
      unfollowScript: Bind.null(),
      sendRequestScript: Bind.null(),
      cancelRequestScript: Bind.null(),
      acceptRequestScript: Bind.null(),
      rejectRequestScript: Bind.null(),
      deleteFriendScript: Bind.null(),
      updateProfileScript: Bind.null(),
      followNotification: Bind.null(),
      receiveRequestNotification: { ...notificationConfig },
      cancelRequestNotification: { ...notificationConfig },
      acceptRequestNotification: { ...notificationConfig },
      rejectRequestNotification: { ...notificationConfig },
      deleteFriendNotification: { ...notificationConfig },
      transactionSetting: {
        acquireActionUseJobQueue: Bind.static(false),
        commitScriptResultInUseDistributor: Bind.static(false),
        distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
        enableAtomicCommit: Bind.static(false),
        enableAutoRun: Bind.static(false),
        queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
        transactionUseDistributor: Bind.static(false),
      },
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
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.SendFriendRequest)
      .mountLocal(SendFriendRequest)
      .bindings({
        publicProfile: Bind.domainProperties([
          Source.direct(SendFriendRequest, "targetPublicProfile"),
        ]),
        targetUserId: Bind.domainProperty(Source.direct(SendFriendRequest, "id")),
        userId: Bind.skip(),
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.friend.ReceiveFriendRequest)
      .mountLocal(ReceiveFriendRequest)
      .bindings({
        publicProfile: Bind.domainProperties([
          Source.direct(ReceiveFriendRequest, "fromPublicProfile"),
        ]),
        targetUserId: Bind.skip(),
        userId: Bind.domainProperty(Source.direct(ReceiveFriendRequest, "id")),
      })
  )

  .build();
