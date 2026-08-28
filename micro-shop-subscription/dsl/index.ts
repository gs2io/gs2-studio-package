import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

/** The schedule namespace whose triggers drive a subscription's renewal. */
const SCHEDULE_NAMESPACE_RESOURCE_ID = "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d";

/**
 * A recurring store purchase — a monthly pass, a season pass. GS2-Money2
 * verifies the store receipt and keeps the subscription alive; a schedule
 * trigger marks each period so the rest of the game can hang daily grants off
 * it.
 *
 * This is a store subscription, not a wallet purchase: it lives in its own
 * money2 namespace so a project's currency balance stays where the currency
 * package puts it.
 */
const StoreSubscription = defineDomainType("StoreSubscription", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("appleSubscriptionGroupIdentifier")
        .masterData()
        .description("App Store subscription group")
    )
    .property(
      PT.string("googlePlayProductId").masterData().description("Google Play subscription product")
    )
    .property(
      PT.string("renewalTrigger")
        .assetDelivery()
        .required()
        .description("Trigger pulled each time the subscription renews")
    )
    .property(
      PT.prop("triggerExtendMode", PT.enum("just", "rollupHour"))
        .masterData()
        .description("Whether a renewal extends exactly or rounds to an hour")
    )
    .property(PT.int32("rollupHour").masterData().description("Hour renewals round to"))
    .property(
      PT.int32("reallocateSpanDays")
        .masterData()
        .description("Days before expiry that the store may re-bill")
    )
    .property(
      PT.prop("status", PT.enum("active", "inactive"))
        .userData()
        .required()
        .description("Whether the player currently holds it")
    )
    .property(PT.timestamp("expiresAt").userData().required().description("When it lapses"))
    .localizedProperties({
      id: jaEnId("サブスクリプション商品", "subscription product"),
      appleSubscriptionGroupIdentifier: jaEnField(
        "App StoreサブスクリプショングループID",
        "App Store subscription group ID",
        "App Store Connectで登録したサブスクリプショングループの識別子です。",
        "Subscription group identifier registered in App Store Connect."
      ),
      googlePlayProductId: jaEnField(
        "Google Play商品ID",
        "Google Play product ID",
        "Google Play Consoleで登録した定期購入商品の識別子です。",
        "Subscription product identifier registered in Google Play Console."
      ),
      renewalTrigger: jaEnField(
        "更新トリガー",
        "Renewal trigger",
        "サブスクリプション更新時に発火するスケジュールトリガーです。",
        "Schedule trigger fired whenever the subscription renews."
      ),
      triggerExtendMode: jaEnField(
        "トリガー延長方式",
        "Trigger extension mode",
        "更新日時をそのまま使うか指定時刻へ丸めるかを設定します。",
        "Whether renewal extends exactly or is rounded to a configured hour."
      ),
      rollupHour: jaEnField(
        "丸め時刻",
        "Rollup hour",
        "更新トリガーを丸める場合の時刻です。",
        "Hour used when renewal triggers are rounded.",
        { ja: "時", en: "hour" }
      ),
      reallocateSpanDays: jaEnField(
        "再請求猶予期間",
        "Reallocation period",
        "期限前にストアが再請求を行える期間です。",
        "Period before expiration during which the store may re-bill.",
        { ja: "日", en: "days" }
      ),
      status: jaEnField(
        "加入状態",
        "Subscription status",
        "プレイヤーの現在のサブスクリプション加入状態です。",
        "Player's current subscription status."
      ),
      expiresAt: jaEnField(
        "有効期限",
        "Expiration time",
        "プレイヤーのサブスクリプションが失効する日時です。",
        "Time when the player's subscription expires."
      ),
    })
);

const StoreSubscriptionContentModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.money2.StoreSubscriptionContentModel)
    .mountLocal(StoreSubscription)
    .bindings({
      name: Bind.domainProperty(Source.direct(StoreSubscription, "id")),
      metadata: Bind.static(""),
      triggerName: Bind.domainProperty(Source.direct(StoreSubscription, "renewalTrigger")),
      triggerExtendMode: Bind.domainProperty(Source.direct(StoreSubscription, "triggerExtendMode")),
      rollupHour: Bind.domainProperty(Source.direct(StoreSubscription, "rollupHour")),
      reallocateSpanDays: Bind.domainProperty(
        Source.direct(StoreSubscription, "reallocateSpanDays")
      ),
      appleAppStore: {
        subscriptionGroupIdentifier: Bind.domainProperty(
          Source.direct(StoreSubscription, "appleSubscriptionGroupIdentifier")
        ),
      },
      googlePlay: {
        productId: Bind.domainProperty(Source.direct(StoreSubscription, "googlePlayProductId")),
      },
    })
    .grnFieldMount("scheduleNamespaceId", SCHEDULE_NAMESPACE_RESOURCE_ID, [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
);

export const microShopSubscription = definePackage("micro-shop-subscription", "0.0.0")
  .display({
    label: { ja: "サブスクリプション", en: "Subscriptions" },
    description: {
      ja: "月額パスなどの継続課金を扱います。更新のたびにスケジュールのトリガーが引かれ、加入状況と有効期限を保持します。",
      en: "Handles recurring store purchases such as a monthly pass, pulling a schedule trigger on each renewal and tracking who currently holds it.",
    },
  })
  .displayType(StoreSubscription, {
    label: { ja: "サブスク商品", en: "Subscription" },
    description: {
      ja: "App Store・Google Playの商品識別子、更新トリガー、有効期限を設定・管理します。",
      en: "Configures store product identifiers and renewal triggers, and tracks subscription status and expiration.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(StoreSubscription)

  .masterDataResource(r =>
    r
      .model(GS2.money2.Namespace)
      .bindings({
        name: Bind.static("Subscription"),
        currencyUsagePriority: Bind.static("PrioritizeFree"),
        sharedFreeCurrency: Bind.static(false),
        platformSetting: {
          appleAppStore: Bind.static({
            bundleId: null,
            issuerId: null,
            keyId: null,
            privateKeyPem: null,
            sharedSecretKey: null,
          }),
          googlePlay: Bind.static({ packageName: null, publicKey: null }),
          fake: { acceptFakeReceipt: Bind.static("Reject") },
        },
        changeSubscriptionStatusNotification: Bind.null(),
        depositBalanceScript: Bind.null(),
        withdrawBalanceScript: Bind.null(),
        verifyReceiptScript: Bind.null(),
        subscribeScript: Bind.null(),
        renewScript: Bind.null(),
        unsubscribeScript: Bind.null(),
        takeOverScript: Bind.null(),
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
      .addChild(StoreSubscriptionContentModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.money2.SubscriptionStatus)
      .mountLocal(StoreSubscription)
      .bindings({
        contentName: Bind.domainProperty(Source.direct(StoreSubscription, "id")),
        status: Bind.domainProperties([Source.direct(StoreSubscription, "status")]),
        expiresAt: Bind.domainProperties([Source.direct(StoreSubscription, "expiresAt")]),
        userId: Bind.skip(),
      })
  )
  .build();
