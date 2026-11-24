import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUiComponent,
  defineUserDataResource,
  instance,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const Wallet = defineDomainType("Wallet", {
  properties: {
    free: PT.int32().userData().required(),
    paid: PT.int32().userData().required(),
    total: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ウォレット",
      description: "プレイヤーの1つのウォレットスロットにある有償・無償通貨の残高です。",
    },
    en: {
      label: "Wallet",
      description: "A player's paid and free currency balances in one GS2 Money2 wallet slot.",
    },
  },
  localizedProperties: {
      id: jaEnField(
        "ID",
        "ID",
        'GS2 Money2 のウォレットのスロット番号を10進の文字列にしたものです（スロット 0 は "0"）。このパッケージの transform の slot 引数と同じウォレットを指します。行は不要で、作成してもデプロイ内容と生成コードは変わりません。',
        'GS2 Money2 wallet slot number as a decimal string (slot 0 is "0"). The slot parameter of this package\'s transforms names the same wallet. No row is needed; an authored row changes neither deploy output nor generated code.'
      ),
      free: jaEnField(
        "無償残高",
        "Free balance",
        "無償通貨の現在残高です。",
        "Current free-currency balance.",
        { ja: "通貨", en: "currency" }
      ),
      paid: jaEnField(
        "有償残高",
        "Paid balance",
        "有償通貨の現在残高です。",
        "Current paid-currency balance.",
        { ja: "通貨", en: "currency" }
      ),
      total: jaEnField(
        "合計残高",
        "Total balance",
        "有償・無償通貨を合わせた現在残高です。",
        "Current combined paid and free currency balance.",
        { ja: "通貨", en: "currency" }
      ),
    },
});

const StoreProduct = defineDomainType("StoreProduct", {
  properties: {
    appleAppStoreProductId: PT.string().masterData(),
    googlePlayProductId: PT.string().masterData(),
  },
  localizedDisplay: {
    ja: {
      label: "ストア商品",
      description: "ストア商品とApp Store・Google Playの商品IDの対応を設定します。",
    },
    en: {
      label: "Store product",
      description: "Maps a store product to its App Store and Google Play product identifiers.",
    },
  },
  localizedProperties: {
      id: jaEnId("ストア商品", "store product"),
      appleAppStoreProductId: jaEnField(
        "App Store商品ID",
        "App Store product ID",
        "App Store Connectで登録した商品の識別子です。",
        "Product identifier registered in App Store Connect."
      ),
      googlePlayProductId: jaEnField(
        "Google Play商品ID",
        "Google Play product ID",
        "Google Play Consoleで登録した商品の識別子です。",
        "Product identifier registered in Google Play Console."
      ),
    },
});

const CurrencyStore = defineDomainType("CurrencyStore", {
  singleEntry: true,
  properties: {
    enableFakeReceipt: PT.enum("Accept", "Reject").masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "通貨ストア",
      description: "レシート検証とテスト購入に関する通貨ストア設定を管理します。",
    },
    en: {
      label: "Currency store",
      description:
        "Configures receipt validation and test-purchase behavior for the currency store.",
    },
  },
  localizedProperties: {
      id: jaEnId("通貨ストア", "currency store"),
      enableFakeReceipt: jaEnField(
        "テストレシート",
        "Test receipts",
        "テスト購入用の偽レシートを受け付けるかを設定します。",
        "Whether fake receipts used for test purchases are accepted."
      ),
    },
});

const SLOT_PARAMETER =
  'GS2 Money2 wallet slot. The Wallet whose id is the slot as a decimal string (slot 0 is "0") shows its balance; no Wallet row is needed. Free and paid balances are separate per slot.';

const Namespace = defineMasterDataResource({
  model: GS2.money2.Namespace,
  mount: CurrencyStore,
  bindings: {
      name: Bind.static("Currency"),
      changeSubscriptionStatusNotification: Bind.null(),
      currencyUsagePriority: Bind.static("PrioritizeFree"),
      ...Bind.nulls("depositBalanceScript", "logSetting"),
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
      ...Bind.nulls("subscribeScript", "takeOverScript"),
      transactionSettingV2: transactionSettingV2(),
      ...Bind.nulls("unsubscribeScript", "verifyReceiptScript", "withdrawBalanceScript"),
    },
  children: [
    defineMasterDataResource({
  model: GS2.money2.StoreContentModel,
  mount: StoreProduct,
  bindings: {
          name: Bind.domainProperty(Source.direct(StoreProduct, "id")),
          appleAppStore: {
            productId: Bind.domainProperty(Source.direct(StoreProduct, "appleAppStoreProductId")),
          },
          googlePlay: {
            productId: Bind.domainProperty(Source.direct(StoreProduct, "googlePlayProductId")),
          },
        },
}),
  ],
});

const DepositFreeCurrencyTransform = defineActionTransform("DepositFreeCurrency", {
  category: "acquire",
  parameters: {
    slot: { type: PT.int32(), description: SLOT_PARAMETER },
    count: {
        type: PT.int32(),
        description: "Amount of free currency to deposit (price 0).",
      },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Money2:DepositByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      slot: OutputMap.parameter("slot"),
      "depositTransactions[0].price": OutputMap.static(0),
      "depositTransactions[0].currency": OutputMap.static(""),
      "depositTransactions[0].count": OutputMap.parameter("count"),
    },
  },
  ],
});

const DepositCurrencyTransform = defineActionTransform("DepositCurrency", {
  category: "acquire",
  parameters: {
    slot: { type: PT.int32(), description: SLOT_PARAMETER },
    count: {
        type: PT.int32(),
        description: "Amount of currency to deposit; it is paid currency when price > 0.",
      },
    currencyType: {
        type: PT.string(),
        description:
          "ISO currency code of the purchase price, such as JPY; used only when price > 0.",
      },
    price: {
        type: PT.float64(),
        description:
          "Purchase price in currencyType; GS2 Money2 treats a deposit with price 0 as free currency.",
      },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Money2:DepositByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      slot: OutputMap.parameter("slot"),
      "depositTransactions[0].price": OutputMap.parameter("price"),
      "depositTransactions[0].currency": OutputMap.parameter("currencyType"),
      "depositTransactions[0].count": OutputMap.parameter("count"),
    },
  },
  ],
});

const WithdrawCurrencyTransform = defineActionTransform("WithdrawCurrency", {
  category: "consume",
  parameters: {
    slot: { type: PT.int32(), description: SLOT_PARAMETER },
    paidOnly: {
        type: PT.bool(),
        required: false,
        description:
          "When true, only paid currency is withdrawn; otherwise free currency is used first (the namespace sets PrioritizeFree).",
      },
    count: { type: PT.int32(), description: "Amount of currency to withdraw." },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Money2:WithdrawByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      slot: OutputMap.parameter("slot"),
      withdrawCount: OutputMap.parameter("count"),
      paidOnly: OutputMap.parameter("paidOnly"),
    },
  },
  ],
});

const WithdrawPaidCurrencyTransform = defineActionTransform("WithdrawPaidCurrency", {
  category: "consume",
  parameters: {
    slot: { type: PT.int32(), description: SLOT_PARAMETER },
    count: {
        type: PT.int32(),
        description: "Amount of paid currency to withdraw.",
      },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Money2:WithdrawByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      slot: OutputMap.parameter("slot"),
      withdrawCount: OutputMap.parameter("count"),
      paidOnly: OutputMap.static(true),
    },
  },
  ],
});

const VerifyReceiptTransform = defineActionTransform("VerifyReceipt", {
  category: "consume",
  parameters: {
    contentName: {
        type: PT.ref(StoreProduct),
        description: "StoreProduct id, which is the GS2 Money2 store content model name.",
      },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Money2:VerifyReceiptByUserId",
    resource: () => Namespace,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      contentName: OutputMap.parameter("contentName"),
      receipt: OutputMap.placeholder("#{receipt}"),
    },
  },
  ],
});

export const foundationEconomyCurrency = definePackage({
  id: "foundation-economy-currency",
  version: "0.0.1",
  display: {
    ja: {
      label: "通貨",
      description: "ゲーム内通貨の残高（ウォレット）と、通貨を購入するストア商品を扱います。",
    },
    en: {
      label: "Currency",
      description:
        "Manages an in-game currency balance (wallet) and the store products that sell it.",
    },
  },
  domainTypes: [Wallet, StoreProduct, CurrencyStore],
  instances: [
    instance(CurrencyStore, "currencystore", { enableFakeReceipt: "Reject" }),
  ],
  masterDataResources: [
    Namespace,
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.money2.Wallet,
  mount: Wallet,
  bindings: {
        // Use the exposed wallet slot as identity; a separate slot property would duplicate the reserved id.
        slot: Bind.domainProperty(Source.direct(Wallet, "id")),
        summary: {
          free: Bind.domainProperty(Source.direct(Wallet, "free")),
          paid: Bind.domainProperty(Source.direct(Wallet, "paid")),
          total: Bind.domainProperty(Source.direct(Wallet, "total")),
        },
        userId: Bind.skip(),
        walletId: Bind.skip(),
        sharedFreeCurrency: Bind.skip(),
      },
}),
  ],
  actionTransforms: [DepositFreeCurrencyTransform, DepositCurrencyTransform, WithdrawCurrencyTransform, WithdrawPaidCurrencyTransform, VerifyReceiptTransform],
  uiComponents: [
    defineUiComponent(Wallet, {
  items: [
    UiItem.label("FreeBalanceLabel", UiSource.prop("free"), { name: "FreeBalance" }),
    UiItem.label("PaidBalanceLabel", UiSource.prop("paid"), { name: "PaidBalance" }),
    UiItem.label("TotalBalanceLabel", UiSource.prop("total"), { name: "TotalBalance" }),
  ],
}),
  ],
});
