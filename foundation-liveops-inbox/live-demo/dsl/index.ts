/**
 * Live demo content for `foundation-liveops-inbox`.
 *
 * The feature package defines the inbox and the press that opens a message,
 * but a fresh visitor's inbox is empty. The client's own way to take in a
 * global message, `ReceiveGlobalMessage`, is not hosted by any Gs2Bind loader,
 * so no generated press can reach it. Instead this package supplies one
 * announcement and a press that sends its payload to the visitor through an
 * exchange. Unlike a real reception, every press delivers another message, so
 * each one lands one more unread row in the list below it, and opening one
 * flips it to read.
 *
 * A second press delivers a gift: a message that carries free currency, which
 * the currency package's wallet receives when the message is opened.
 */

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

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const inbox = dependencyPackage(inboxSurface);
// Where the gift is paid. The wallet, its Money2 namespace and the deposit are
// the currency package's, so none of them is authored again here.
const currency = dependencyPackage(currencySurface);

/** The announcement a visitor can have delivered. */
const GlobalMessage = inbox.type("GlobalMessage");

/** A message in the visitor's own inbox. */
const Message = inbox.type("Message");

/** How long a delivered copy stays in the inbox before GS2 discards it. */
const EXPIRE_DAYS = 7;

/** The demo shows one player with one wallet, slot 0. */
const WALLET_SLOT = 0;

/** Free currency the gift carries. */
const GIFT_AMOUNT = 100;

/**
 * A message the operator sends with free currency attached.
 *
 * Its own type rather than a second announcement row: every gift carries an
 * amount, so its exchange can always build the reward, while the plain
 * announcement keeps delivering a message that carries nothing.
 */
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
        "無償通貨",
        "Free currency",
        "メッセージを開いたときに受け取る無償通貨の量です。",
        "Free currency received when the message is opened.",
        { ja: "通貨", en: "currency" }
      ),
    })
);

/**
 * Delivering the announcement, modelled as an exchange that costs nothing and
 * sends its payload to the visitor. The rate is named after the announcement
 * because a delegated action on `GlobalMessage` must target a resource that
 * mounts `GlobalMessage` — that is how the generated loader learns which rate
 * to exchange.
 */
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

/**
 * Delivering the gift: an exchange that costs nothing and sends a message whose
 * read rewards are the currency package's free deposit. The deposit is nested
 * as a transform rather than read off a property, so its namespace and the
 * player it pays are resolved the same way any other currency deposit is.
 */
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
  // The currency stack is shared by every demo that depends on the currency
  // package, and the last one deployed wins. Depending on its demo package too
  // deploys the same stack the currency demo does, store products included.
  .dependency("foundation-economy-currency-demo", "github:gs2io/gs2-studio-package")
  .domainType(Gift)

  // A global message must carry a reception period, but it only gates
  // `ReceiveGlobalMessage`, which this demo never calls; the Deliver press
  // ignores it. It is kept wide, the same window the schedule demo uses, so
  // the deployed announcement stays valid while the demo stands.
  .instance(GlobalMessage, "welcome", {
    [inbox.propertyId("GlobalMessage", "payload")]: "Welcome to the GS2 inbox demo!",
    [inbox.propertyId("GlobalMessage", "begin")]: 1789064562011, // 2026-09-10
    [inbox.propertyId("GlobalMessage", "end")]: 1924992000000, // 2031-01-01
  })

  .instance("Gift", "gift", {
    payload: `A gift from the operator: ${GIFT_AMOUNT} free currency.`,
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
        // The demo runs the transaction server-side and commits it atomically,
        // so a press lands the message without a stamp sheet round trip.
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
      // `Read` is the feature package's own press, through the Message
      // loader's `Gs2Inbox:ReadMessage`, so the demo supplies the button and
      // nothing else.
      .buttonAction("OpenButton", "Read", undefined, { name: "Message" })
      .templateLabel("OpenedLabel", "Opened.", {}, { name: "Message" })
      // An active toggle carries the rows its condition empties. The feature
      // package's `ReadActiveToggle` empties the Open button once a message is
      // read; this one empties the note until then. Written as `not(isRead)`
      // rather than through `invert`, so the generated summary describes what
      // it does.
      .activeToggle("UnreadActiveToggle", UiCond.not(UiCond.truthy(ui.prop("isRead"))), {
        name: "Message",
      })
  )

  .uiComponent(Gift, ui =>
    ui
      // Read back off the row: the amount sits in the deposit nested inside
      // the message this gift's exchange sends.
      .templateLabel(
        "AmountLabel",
        "Carries {amount} free currency.",
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
