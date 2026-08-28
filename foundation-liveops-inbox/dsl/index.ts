import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const GlobalMessage = defineDomainType("GlobalMessage", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("payload").masterData().required())
    .property(PT.timestamp("begin").masterData().required())
    .property(PT.timestamp("end").masterData().required())
    .localizedProperties({
      id: jaEnId("全体メッセージ", "global message"),
      payload: jaEnField(
        "メッセージ内容",
        "Message payload",
        "全プレイヤーへ配信するメッセージの内容です。",
        "Content delivered to all players."
      ),
      begin: jaEnField(
        "配信開始日時",
        "Delivery start",
        "メッセージの受け取りを開始する日時です。",
        "Time when the message becomes available."
      ),
      end: jaEnField(
        "配信終了日時",
        "Delivery end",
        "メッセージの受け取りを終了する日時です。",
        "Time when the message stops being available."
      ),
    })
);

const Message = defineDomainType("Message", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("payload").userData().required())
    .property(PT.bool("isRead").userData().required())
    .property(PT.timestamp("receivedAt").userData().required())
    .property(PT.timestamp("expiresAt").userData())
    .localizedProperties({
      id: jaEnId("メッセージ", "message"),
      payload: jaEnField(
        "メッセージ内容",
        "Message payload",
        "プレイヤーの受信箱へ届いたメッセージの内容です。",
        "Content of the message delivered to the player's inbox."
      ),
      isRead: jaEnField(
        "既読",
        "Read",
        "プレイヤーがこのメッセージを開いたかを示します。",
        "Whether the player has opened this message."
      ),
      receivedAt: jaEnField(
        "受信日時",
        "Received at",
        "メッセージを受信した日時です。",
        "Time when the message was received."
      ),
      expiresAt: jaEnField(
        "有効期限",
        "Expiration time",
        "メッセージを保持する期限です。",
        "Time until which the message remains available."
      ),
    })
);

const InboxNamespace = defineMasterDataResource(resource => {
  resource
    .model(GS2.inbox.Namespace)
    .bindings({
      name: Bind.static("Inbox"),
      deleteMessageScript: Bind.null(),
      logSetting: Bind.null(),
      readMessageScript: Bind.null(),
      receiveMessageScript: Bind.null(),
      receiveNotification: Bind.null(),
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
    .addChild(child => {
      child
        .model(GS2.inbox.GlobalMessage)
        .mountLocal(GlobalMessage)
        .bindings({
          name: Bind.domainProperty(Source.direct(GlobalMessage, "id")),
          metadata: Bind.domainProperty(Source.direct(GlobalMessage, "payload")),
          expiresTimeSpan: Bind.null(),
        })
        .grnKeyBinding(
          "messageReceptionPeriodEventId",
          "namespaceName",
          Bind.static("InboxSchedule")
        )
        .grnKeyBinding(
          "messageReceptionPeriodEventId",
          "eventName",
          Bind.domainProperty(Source.direct(GlobalMessage, "id"))
        );
    });
});

export const foundationLiveopsInbox = definePackage("foundation-liveops-inbox", "0.0.0")
  .display({
    label: { ja: "お知らせ・受信箱", en: "Inbox" },
    description: {
      ja: "運営からのお知らせや、アイテム付きメッセージをプレイヤーに届けます。",
      en: "Delivers announcements and item-attached messages from the operator to players.",
    },
  })
  .displayType(GlobalMessage, {
    label: { ja: "全体メッセージ", en: "Global message" },
    description: {
      ja: "全プレイヤーへ配信するメッセージ、受取期間、添付報酬を設定します。",
      en: "Defines a message sent to all players, its claim period, and attached rewards.",
    },
  })
  .displayType(Message, {
    label: { ja: "メッセージ", en: "Message" },
    description: {
      ja: "プレイヤーの受信箱に届く個別メッセージと受取状態を管理します。",
      en: "Tracks individual inbox messages delivered to a player and their claim state.",
    },
  })
  .domainType(GlobalMessage)
  .domainType(Message)

  .masterDataResource(InboxNamespace)

  .masterDataResource(r => {
    r.model(GS2.schedule.Namespace)
      .mountLocal(GlobalMessage)
      .bindings({
        name: Bind.static("InboxSchedule"),
        logSetting: Bind.null(),
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
      .addChild(child => {
        child
          .model(GS2.schedule.Event)
          .mountLocal(GlobalMessage)
          .bindings({
            name: Bind.domainProperty(Source.direct(GlobalMessage, "id")),
            absoluteBegin: Bind.domainProperty(
              Source.parent(Source.direct(GlobalMessage, "begin"))
            ),
            absoluteEnd: Bind.domainProperty(Source.parent(Source.direct(GlobalMessage, "end"))),
            scheduleType: Bind.static("absolute"),
            repeatSetting: Bind.null(),
          });
      });
  })

  .userDataResource(r =>
    r
      .model(GS2.inbox.Message)
      .mountLocal(Message)
      .bindings({
        name: Bind.domainProperty(Source.direct(Message, "id")),
        metadata: Bind.domainProperties([Source.direct(Message, "payload")]),
        receivedAt: Bind.domainProperties([Source.direct(Message, "receivedAt")]),
        isRead: Bind.domainProperties([Source.direct(Message, "isRead")]),
        expiresAt: Bind.domainProperties([Source.direct(Message, "expiresAt")]),
        messageId: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("SendMessage", at =>
    at
      .category("acquire")
      .parameter("metadata", { type: PT.string() })
      .parameter("expireDays", { type: PT.int32() })
      .output("Gs2Inbox:SendMessageByUserId", o =>
        o
          .resourceRef(() => InboxNamespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("metadata", "metadata")
          .mapStatic("expiresAt", null)
          .mapParameter("expiresTimeSpan.days", "expireDays")
          .mapStatic("expiresTimeSpan.hours", null)
          .mapStatic("expiresTimeSpan.minutes", null)
      )
  )
  .actionTransform("SendMessageWithReward", at =>
    at
      .category("acquire")
      .parameter("metadata", { type: PT.string() })
      .parameter("expireDays", { type: PT.int32() })
      .output("Gs2Inbox:SendMessageByUserId", o =>
        o
          .resourceRef(() => InboxNamespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("metadata", "metadata")
          .mapStatic("expiresAt", null)
          .mapParameter("expiresTimeSpan.days", "expireDays")
          .mapStatic("expiresTimeSpan.hours", null)
          .mapStatic("expiresTimeSpan.minutes", null)
      )
  )
  .build();
