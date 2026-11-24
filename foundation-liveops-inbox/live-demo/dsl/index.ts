import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  PT,
  Source,
  transactionSettingV2,
  UiCond,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../../dsl/jaEnField";

import currencySurface from "../../../foundation-economy-currency/dsl/dependency-surface.json";

import inboxSurface from "../../dsl/dependency-surface.json";

const inbox = dependencyPackage(inboxSurface);

const currency = dependencyPackage(currencySurface);

const GlobalMessage = inbox.type("GlobalMessage");

const Message = inbox.type("Message");

const EXPIRE_DAYS = 7;

const WALLET_SLOT = 0;

const GIFT_AMOUNT = 100;

const Gift = defineDomainType("Gift", {
  singleEntry: true,
  properties: {
    payload: PT.string().masterData().required(),
    amount: PT.int32().masterData().required(),
  },
  localizedProperties: {
      id: jaEnId("贈り物", "gift"),
      payload: jaEnField(
        "メッセージ内容",
        "Message payload",
        "贈り物と一緒に届くメッセージの内容です。",
        "Content of the message the gift arrives with."
      ),
      amount: jaEnField(
        "コイン",
        "Coins",
        "メッセージを開いたときに受け取るコインの量です。",
        "Coins received when the message is opened.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

const DeliverRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: GlobalMessage,
  bindings: { name: Bind.domainProperty(Source.direct(GlobalMessage, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: GlobalMessage,
  actionProgram: ActionProgram.transform(inbox.packageId, inbox.transformId("SendMessage"), [
            Arg.domainProperty(
              "metadata",
              Source.parent(
                Source.direct(GlobalMessage, inbox.propertyId("GlobalMessage", "payload"))
              )
            ),
            Arg.static("expireDays", EXPIRE_DAYS),
          ]),
}),
    ],
  },
});

const GiftRateModel = defineMasterDataResource({
  model: GS2.exchange.RateModel,
  mount: Gift,
  bindings: { name: Bind.domainProperty(Source.direct(Gift, "id")) },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: Gift,
  actionProgram: ActionProgram.transform(inbox.packageId, inbox.transformId("SendMessageWithReward"), [
            Arg.domainProperty("metadata", Source.parent(Source.direct(Gift, "payload"))),
            Arg.static("expireDays", EXPIRE_DAYS),
            Arg.actionTransformRef(
              "rewards",
              currency.packageId,
              currency.transformId("DepositFreeCurrency"),
              [
                Arg.static("slot", WALLET_SLOT),
                Arg.domainProperty("count", Source.parent(Source.direct(Gift, "amount"))),
              ]
            ),
          ]),
}),
    ],
  },
});

export const foundationLiveopsInboxDemo = definePackage({
  id: "foundation-liveops-inbox-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "お知らせ・受信箱（デモデータ）",
      description: "ライブデモ用のお知らせと、それを自分の受信箱へ届ける操作を提供します。",
    },
    en: {
      label: "Inbox (demo data)",
      description:
        "Supplies the announcement used by the live demo, and the press that delivers it to your own inbox.",
    },
  },
  dependencies: {
    [inbox.packageId]: "github:gs2io/gs2-studio-package",
    [currency.packageId]: "github:gs2io/gs2-studio-package",
    "foundation-economy-currency-demo": "github:gs2io/gs2-studio-package",
    "micro-shop-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [Gift],
  instances: [
    instance(GlobalMessage, "welcome", {
    [inbox.propertyId("GlobalMessage", "payload")]: "Welcome to the GS2 inbox demo!",
    [inbox.propertyId("GlobalMessage", "begin")]: "2026-09-10T18:22:42.011Z",
    [inbox.propertyId("GlobalMessage", "end")]: "2031-01-01T00:00:00.000Z",
  }),
    instance(Gift, "gift", {
    payload: `A gift from the operator: ${GIFT_AMOUNT} coins.`,
    amount: GIFT_AMOUNT,
  }),
  ],
  delegatedActions: [
    { target: Gift, methodName: "Deliver", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: GiftRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
    { target: GlobalMessage, methodName: "Deliver", action: { targetActionKey: "Gs2Exchange:RateModel.Exchange", targetResource: DeliverRateModel, parameterOverrides: [{ parameterName: "count", source: { kind: "static", value: 1 } }] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("InboxDeliver"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run delivers the message without a second client request to execute the transaction.
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    DeliverRateModel,
  ],
}),
    defineMasterDataResource({
  model: GS2.exchange.Namespace,
  bindings: {
        name: Bind.static("InboxGift"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    GiftRateModel,
  ],
}),
  ],
  uiComponents: [
    defineUiComponent(GlobalMessage, {
  items: [
    UiItem.buttonAction("DeliverButton", "Deliver", undefined, { name: "GlobalMessage" }),
  ],
}),
    defineUiComponent(Message, {
  items: [
    UiItem.buttonAction("OpenButton", "Read", undefined, { name: "Message" }),
    UiItem.templateLabel("OpenedLabel", "Opened.", {}, { name: "Message" }),
    UiItem.activeToggle("UnreadActiveToggle", UiCond.not(UiCond.truthy(UiSource.prop("isRead"))), {
        name: "Message",
      }),
  ],
}),
    defineUiComponent(Gift, {
  items: [
    UiItem.templateLabel("AmountLabel", "Carries {amount} coins.", { amount: UiSource.prop("amount") }, { name: "Gift" }),
    UiItem.buttonAction("DeliverButton", "Deliver", undefined, { name: "Gift" }),
  ],
}),
  ],
});
