import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const GlobalMessage = defineDomainType("GlobalMessage", {
  properties: {
    payload: PT.string().masterData().required(),
    begin: PT.timestamp().masterData().required(),
    end: PT.timestamp().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "全体メッセージ",
      description: "全プレイヤーへ配信するメッセージ、受取期間、添付報酬を設定します。",
    },
    en: {
      label: "Global message",
      description: "Defines a message sent to all players, its claim period, and attached rewards.",
    },
  },
  localizedProperties: {
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
    },
});

const Message = defineDomainType("Message", {
  properties: {
    payload: PT.string().userData().required(),
    isRead: PT.bool().userData().required(),
    receivedAt: PT.timestamp().userData().required(),
    expiresAt: PT.timestamp().userData(),
  },
  localizedDisplay: {
    ja: {
      label: "メッセージ",
      description: "プレイヤーの受信箱に届く個別メッセージと受取状態を管理します。",
    },
    en: {
      label: "Message",
      description: "Tracks individual inbox messages delivered to a player and their claim state.",
    },
  },
  localizedProperties: {
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
    },
});

const InboxNamespace = defineMasterDataResource({
  model: GS2.inbox.Namespace,
  bindings: {
      name: Bind.static("Inbox"),
      ...Bind.nulls(
        "deleteMessageScript",
        "logSetting",
        "readMessageScript",
        "receiveMessageScript",
        "receiveNotification"
      ),
      transactionSettingV2: transactionSettingV2(),
    },
  children: [
    defineMasterDataResource({
  model: GS2.inbox.GlobalMessage,
  mount: GlobalMessage,
  bindings: {
          name: Bind.domainProperty(Source.direct(GlobalMessage, "id")),
          metadata: Bind.domainProperty(Source.direct(GlobalMessage, "payload")),
          expiresTimeSpan: Bind.null(),
        },
  grnKeyBindings: [
    { parameterName: "messageReceptionPeriodEventId", keyName: "namespaceName", directive: Bind.static("InboxSchedule") },
    { parameterName: "messageReceptionPeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(GlobalMessage, "id")) },
  ],
}),
  ],
});

const InboxMessage = defineUserDataResource({
  model: GS2.inbox.Message,
  mount: Message,
  bindings: {
      name: Bind.domainProperty(Source.direct(Message, "id")),
      metadata: Bind.domainProperties([Source.direct(Message, "payload")]),
      receivedAt: Bind.domainProperties([Source.direct(Message, "receivedAt")]),
      isRead: Bind.domainProperties([Source.direct(Message, "isRead")]),
      expiresAt: Bind.domainProperties([Source.direct(Message, "expiresAt")]),
      messageId: Bind.skip(),
      userId: Bind.skip(),
    },
});

const SendMessageTransform = defineActionTransform("SendMessage", {
  category: "acquire",
  parameters: {
    metadata: { type: PT.string() },
    expireDays: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inbox:SendMessageByUserId",
    resource: () => InboxNamespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      metadata: OutputMap.parameter("metadata"),
      expiresAt: OutputMap.static(null),
      "expiresTimeSpan.days": OutputMap.parameter("expireDays"),
      "expiresTimeSpan.hours": OutputMap.static(null),
      "expiresTimeSpan.minutes": OutputMap.static(null),
    },
  },
  ],
});

const SendMessageWithRewardTransform = defineActionTransform("SendMessageWithReward", {
  category: "acquire",
  parameters: {
    metadata: { type: PT.string() },
    expireDays: { type: PT.int32() },
    rewards: { type: PT.listOf(PT.acquireAction()) },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Inbox:SendMessageByUserId",
    resource: () => InboxNamespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      metadata: OutputMap.parameter("metadata"),
      readAcquireActions: OutputMap.parameter("rewards"),
      expiresAt: OutputMap.static(null),
      "expiresTimeSpan.days": OutputMap.parameter("expireDays"),
      "expiresTimeSpan.hours": OutputMap.static(null),
      "expiresTimeSpan.minutes": OutputMap.static(null),
    },
  },
  ],
});

export const foundationLiveopsInbox = definePackage({
  id: "foundation-liveops-inbox",
  version: "0.0.1",
  display: {
    ja: {
      label: "お知らせ・受信箱",
      description: "運営からのお知らせや、アイテム付きメッセージをプレイヤーに届けます。",
    },
    en: {
      label: "Inbox",
      description:
        "Delivers announcements and item-attached messages from the operator to players.",
    },
  },
  domainTypes: [GlobalMessage, Message],
  delegatedActions: [
    { target: Message, methodName: "Read", action: { targetActionKey: "Gs2Inbox:Message.ReadMessage", targetResource: InboxMessage, parameterOverrides: [] } },
  ],
  masterDataResources: [
    InboxNamespace,
    defineMasterDataResource({
  model: GS2.schedule.Namespace,
  bindings: {
        name: Bind.static("InboxSchedule"),
        logSetting: Bind.null(),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    defineMasterDataResource({
  model: GS2.schedule.Event,
  mount: GlobalMessage,
  bindings: {
            name: Bind.domainProperty(Source.direct(GlobalMessage, "id")),
            absoluteBegin: Bind.domainProperty(Source.direct(GlobalMessage, "begin")),
            absoluteEnd: Bind.domainProperty(Source.direct(GlobalMessage, "end")),
            scheduleType: Bind.static("absolute"),
            // Keep messages receivable throughout their absolute period without an additional repeat window.
            repeatSetting: { repeatType: Bind.static("always") },
          },
}),
  ],
}),
  ],
  userDataResources: [
    InboxMessage,
  ],
  actionTransforms: [SendMessageTransform, SendMessageWithRewardTransform],
  uiComponents: [
    defineUiComponent(Message, {
  items: [
    UiItem.label("PayloadLabel", UiSource.prop("payload"), { name: "Message" }),
    UiItem.activeToggle("ReadActiveToggle", UiCond.truthy(UiSource.prop("isRead")), { name: "Message" }),
  ],
}),
  ],
});
