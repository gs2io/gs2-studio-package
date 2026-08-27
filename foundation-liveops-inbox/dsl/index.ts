import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const GlobalMessage = defineDomainType("GlobalMessage", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("payload").masterData().required())
    .property(PT.timestamp("begin").masterData().required())
    .property(PT.timestamp("end").masterData().required())
);

const Message = defineDomainType("Message", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("payload").userData().required())
    .property(PT.bool("isRead").userData().required())
    .property(PT.timestamp("receivedAt").userData().required())
    .property(PT.timestamp("expiresAt").userData())
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
  .displayType(GlobalMessage, { label: { ja: "全体メッセージ", en: "Global message" } })
  .displayType(Message, { label: { ja: "メッセージ", en: "Message" } })
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
