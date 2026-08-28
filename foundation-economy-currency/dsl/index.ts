import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const Wallet = defineDomainType("Wallet", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("free").userData().required())
    .property(PT.int32("paid").userData().required())
    .property(PT.int32("total").userData().required())
);

const StoreProduct = defineDomainType("StoreProduct", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.string("appleAppStoreProductId").masterData())
    .property(PT.string("googlePlayProductId").masterData())
);

const CurrencyStore = defineDomainType("CurrencyStore", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.prop("enableFakeReceipt", PT.enum("Accept", "Reject")).masterData().required())
);

const Namespace = defineMasterDataResource(resource => {
  resource
    .model(GS2.money2.Namespace)
    .mountLocal(CurrencyStore)
    .bindings({
      name: Bind.static("Currency"),
      changeSubscriptionStatusNotification: Bind.null(),
      currencyUsagePriority: Bind.static("PrioritizeFree"),
      depositBalanceScript: Bind.null(),
      logSetting: Bind.null(),
      platformSetting: {
        appleAppStore: Bind.static({
          bundleId: null,
          issuerId: null,
          keyId: null,
          privateKeyPem: null,
          sharedSecretKey: null,
        }),
        fake: {
          acceptFakeReceipt: Bind.domainProperty(Source.direct(CurrencyStore, "enableFakeReceipt")),
        },
        googlePlay: Bind.static({ packageName: null, publicKey: null }),
      },
      renewScript: Bind.null(),
      sharedFreeCurrency: Bind.static(false),
      subscribeScript: Bind.null(),
      takeOverScript: Bind.null(),
      transactionSetting: {
        acquireActionUseJobQueue: Bind.static(false),
        commitScriptResultInUseDistributor: Bind.static(false),
        distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
        enableAtomicCommit: Bind.static(false),
        enableAutoRun: Bind.static(false),
        queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
        transactionUseDistributor: Bind.static(false),
      },
      unsubscribeScript: Bind.null(),
      verifyReceiptScript: Bind.null(),
      withdrawBalanceScript: Bind.null(),
    })
    .addChild(child => {
      child
        .model(GS2.money2.StoreContentModel)
        .mountLocal(StoreProduct)
        .bindings({
          name: Bind.domainProperty(Source.direct(StoreProduct, "id")),
          appleAppStore: {
            productId: Bind.domainProperty(Source.direct(StoreProduct, "appleAppStoreProductId")),
          },
          googlePlay: {
            productId: Bind.domainProperty(Source.direct(StoreProduct, "googlePlayProductId")),
          },
        });
    });
});

export const foundationEconomyCurrency = definePackage("foundation-economy-currency", "0.0.0")
  .display({
    label: { ja: "通貨", en: "Currency" },
    description: {
      ja: "ゲーム内通貨の残高（ウォレット）と、通貨で買える商品を扱います。",
      en: "Manages an in-game currency balance (wallet) and the products it can buy.",
    },
  })
  .displayType(CurrencyStore, {
    label: { ja: "通貨ストア", en: "Currency store" },
    description: {
      ja: "レシート検証とテスト購入に関する通貨ストア設定を管理します。",
      en: "Configures receipt validation and test-purchase behavior for the currency store.",
    },
  })
  .displayType(StoreProduct, {
    label: { ja: "ストア商品", en: "Store product" },
    description: {
      ja: "ストア商品とApp Store・Google Playの商品IDの対応を設定します。",
      en: "Maps a store product to its App Store and Google Play product identifiers.",
    },
  })
  .displayType(Wallet, {
    label: { ja: "ウォレット", en: "Wallet" },
    description: {
      ja: "プレイヤーが保有する有償・無償通貨の残高を管理します。",
      en: "Tracks a player's paid and free currency balances.",
    },
  })
  .domainType(Wallet)
  .domainType(StoreProduct)
  .domainType(CurrencyStore)
  .instance(CurrencyStore, "currencystore", { enableFakeReceipt: "Reject" })
  .uiComponent(Wallet, ui =>
    ui
      .label("FreeBalanceLabel", ui.prop("free"), { name: "FreeBalance" })
      .label("PaidBalanceLabel", ui.prop("paid"), { name: "PaidBalance" })
      .label("TotalBalanceLabel", ui.prop("total"), { name: "TotalBalance" })
  )
  .masterDataResource(Namespace)
  .userDataResource(r => {
    r.model(GS2.money2.Wallet)
      .mountLocal(Wallet)
      .bindings({
        // `slot` (int32) is the only Money2 Wallet own-key exposed by the Ez
        // SDK (`walletId`/`userId` are not — see `walletId: Bind.skip()`
        // below), so it drives the reserved id directly rather than a
        // separate `Wallet.slot` property (removed; the id is already a
        // string-wrapped `WalletId`, so a redundant int32 property added
        // nothing).
        slot: Bind.domainProperty(Source.direct(Wallet, "id")),
        summary: {
          free: Bind.domainProperty(Source.direct(Wallet, "free")),
          paid: Bind.domainProperty(Source.direct(Wallet, "paid")),
          total: Bind.domainProperty(Source.direct(Wallet, "total")),
        },
        userId: Bind.skip(),
        walletId: Bind.skip(),
        sharedFreeCurrency: Bind.skip(),
      });
  })

  .actionTransform("DepositFreeCurrency", at =>
    at
      .category("acquire")
      .parameter("count", { type: PT.int32() })
      .output("Gs2Money2:DepositByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapPlaceholder("slot", "#{slot}")
          .mapStatic("depositTransactions[0].price", 0)
          .mapStatic("depositTransactions[0].currency", "")
          .mapParameter("depositTransactions[0].count", "count")
      )
  )
  .actionTransform("DepositCurrency", at =>
    at
      .category("acquire")
      .parameter("count", { type: PT.int32() })
      .parameter("currencyType", { type: PT.string() })
      .parameter("price", { type: PT.float64() })
      .output("Gs2Money2:DepositByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapPlaceholder("slot", "#{slot}")
          .mapParameter("depositTransactions[0].price", "price")
          .mapParameter("depositTransactions[0].currency", "currencyType")
          .mapParameter("depositTransactions[0].count", "count")
      )
  )
  .actionTransform("WithdrawCurrency", at =>
    at
      .category("consume")
      .parameter("paidOnly", { type: PT.bool(), required: false })
      .parameter("count", { type: PT.int32() })
      .output("Gs2Money2:WithdrawByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapPlaceholder("slot", "#{slot}")
          .mapParameter("withdrawCount", "count")
          .mapParameter("paidOnly", "paidOnly")
      )
  )
  .actionTransform("WithdrawPaidCurrency", at =>
    at
      .category("consume")
      .parameter("count", { type: PT.int32() })
      .output("Gs2Money2:WithdrawByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapPlaceholder("slot", "#{slot}")
          .mapParameter("withdrawCount", "count")
          .mapStatic("paidOnly", true)
      )
  )
  .actionTransform("VerifyReceipt", at =>
    at
      .category("consume")
      .parameter("contentName", { type: PT.ref("StoreProduct") })
      .output("Gs2Money2:VerifyReceiptByUserId", o =>
        o
          .resourceRef(() => Namespace)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("contentName", "contentName")
          .mapPlaceholder("receipt", "#{receipt}")
      )
  )
  .build();
