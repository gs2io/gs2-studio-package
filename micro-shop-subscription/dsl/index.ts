import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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
  .displayType(StoreSubscription, { label: { ja: "サブスク商品", en: "Subscription" } })
  .dependency(
    "foundation-economy-schedule",
    "file:../../../foundation-economy-schedule/packages/foundation-economy-schedule"
  )
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
