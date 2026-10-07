import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
  UiCond,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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

/** Use a separate gift type so every gift has an amount while plain announcements need no reward. */
const Gift = defineDomainType("Gift", domainType =>
  domainType
    .singleEntry()
    .property(PT.string("payload").masterData().required())
    .property(PT.int32("amount").masterData().required())
    .localizedProperties({
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
    })
);

const DeliverRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(GlobalMessage)
    .bindings({ name: Bind.domainProperty(Source.direct(GlobalMessage, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(GlobalMessage)
        .bindings({
          action: Bind.transform(inbox.packageId, "SendMessage", [
            Arg.domainProperty(
              "metadata",
              Source.parent(
                Source.direct(GlobalMessage, inbox.propertyId("GlobalMessage", "payload"))
              )
            ),
            Arg.static("expireDays", EXPIRE_DAYS),
          ]),
        });
    })
);

/** Reuse the currency deposit transform so gift rewards resolve the same namespace and player as ordinary deposits. */
const GiftRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Gift)
    .bindings({ name: Bind.domainProperty(Source.direct(Gift, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Gift)
        .bindings({
          action: Bind.transform(inbox.packageId, "SendMessageWithReward", [
            Arg.domainProperty("metadata", Source.parent(Source.direct(Gift, "payload"))),
            Arg.static("expireDays", EXPIRE_DAYS),
            Arg.actionTransformRef("rewards", currency.packageId, "DepositFreeCurrency", [
              Arg.static("slot", WALLET_SLOT),
              Arg.domainProperty("count", Source.parent(Source.direct(Gift, "amount"))),
            ]),
          ]),
        });
    })
);

export const foundationLiveopsInboxDemo = definePackage("foundation-liveops-inbox-demo", "0.0.0")
  .display({
    label: { ja: "お知らせ・受信箱（デモデータ）", en: "Inbox (demo data)" },
    description: {
      ja: "ライブデモ用のお知らせと、それを自分の受信箱へ届ける操作を提供します。",
      en: "Supplies the announcement used by the live demo, and the press that delivers it to your own inbox.",
    },
  })
  .dependency(inbox.packageId, "github:gs2io/gs2-studio-package")
  .dependency(currency.packageId, "github:gs2io/gs2-studio-package")
  // Reuse the currency demo content so every dependent demo deploys the same wallet and store products.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")
  .domainType(Gift)

  // Keep the required reception window wide enough for long-lived demo deployments.
  .instance(GlobalMessage, "welcome", {
    [inbox.propertyId("GlobalMessage", "payload")]: "Welcome to the GS2 inbox demo!",
    [inbox.propertyId("GlobalMessage", "begin")]: 1789064562011,
    [inbox.propertyId("GlobalMessage", "end")]: 1924992000000,
  })

  .instance("Gift", "gift", {
    payload: `A gift from the operator: ${GIFT_AMOUNT} coins.`,
    amount: GIFT_AMOUNT,
  })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("InboxDeliver"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run delivers the message without a second client request to execute the transaction.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(DeliverRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("InboxGift"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(GiftRateModel)
  )

  .uiComponent(GlobalMessage, ui =>
    ui.buttonAction("DeliverButton", "Deliver", undefined, { name: "GlobalMessage" })
  )

  .uiComponent(Message, ui =>
    ui
      .buttonAction("OpenButton", "Read", undefined, { name: "Message" })
      .templateLabel("OpenedLabel", "Opened.", {}, { name: "Message" })
      // Hide the opened note while unread; the feature toggle separately hides the Open button after reading.
      .activeToggle("UnreadActiveToggle", UiCond.not(UiCond.truthy(ui.prop("isRead"))), {
        name: "Message",
      })
  )

  .uiComponent(Gift, ui =>
    ui
      .templateLabel(
        "AmountLabel",
        "Carries {amount} coins.",
        { amount: ui.prop("amount") },
        { name: "Gift" }
      )
      .buttonAction("DeliverButton", "Deliver", undefined, { name: "Gift" })
  )

  .delegatedAction(Gift, "Deliver", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: GiftRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .delegatedAction(GlobalMessage, "Deliver", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: DeliverRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })
  .build();
