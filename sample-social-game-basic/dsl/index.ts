import {
  defineActionTransform,
  defineDomainType,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  instance,
  overlayInstance,
  PT,
} from "gs2-studio-dsl";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import currencySurface from "../../foundation-economy-currency/dsl/dependency-surface.json";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

import loginRewardSurface from "../../micro-economy-login-reward/dsl/dependency-surface.json";

import gachaSurface from "../../micro-shop-character-gacha/dsl/dependency-surface.json";

import shopSurface from "../../micro-shop-currency/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const currency = dependencyPackage(currencySurface);

const schedule = dependencyPackage(scheduleSurface);

const loginReward = dependencyPackage(loginRewardSurface);

const gacha = dependencyPackage(gachaSurface);

const shop = dependencyPackage(shopSurface);

const Reward = defineDomainType("Reward", {
  properties: {
    iconAddress: PT.string().assetDelivery().required(),
    labelKey: PT.string().assetDelivery().required(),
  },
});

const LoginReward = defineOverlayDomainType("LoginReward", loginReward.overlay("LoginReward"), {
  properties: {
    rewardType: PT.ref(Reward).masterData().required(),
    contentsId: PT.string().masterData(),
    count: PT.int32().masterData().required(),
  },
  compositeKey: {
      kind: "inherit",
    },
  actionPropertyTransforms: [
    { arguments: [
          {
            parameterName: "rewardType",
            source: {
              kind: "domainProperty",
              propertyName: "rewardType",
            },
          },
          {
            parameterName: "contentsId",
            source: {
              kind: "domainProperty",
              propertyName: "contentsId",
            },
          },
          {
            parameterName: "count",
            source: {
              kind: "domainProperty",
              propertyName: "count",
            },
          },
          {
            parameterName: "slot",
            source: {
              kind: "placeholder",
              value: "#{slot}",
            },
          },
        ], mode: "replace", targetProperty: loginReward.propertyId("LoginReward", "acquireActions"), transform: () => RewardTransform },
  ],
});

const Gacha = defineOverlayDomainType("Gacha", gacha.overlay("Gacha"), {
  properties: {
    paidOnly: PT.bool().masterData().required(),
    price: PT.int32().masterData().required(),
    series: PT.string().masterData().required(),
    drawCount: PT.int32().masterData().required(),
  },
  compositeKey: {
      kind: "override",
      members: ["series", "drawCount"],
    },
  actionPropertyTransforms: [
    { arguments: [
          {
            parameterName: "count",
            source: {
              kind: "domainProperty",
              propertyName: "price",
            },
          },
          {
            parameterName: "paidOnly",
            source: {
              kind: "domainProperty",
              propertyName: "paidOnly",
            },
          },
          {
            parameterName: "slot",
            source: {
              kind: "placeholder",
              value: "#{slot}",
            },
          },
        ], mode: "replace", transformId: currency.transformId("WithdrawCurrency"), transformPackageId: "foundation-economy-currency", targetProperty: gacha.propertyId("Gacha", "consumeActions") },
  ],
});

const RewardTransform = defineActionTransform("Reward", {
  category: "acquire",
  parameters: {
    rewardType: { type: PT.ref(() => Reward) },
    contentsId: { type: PT.string(), required: false },
    count: { type: PT.int32() },
    slot: { type: PT.int32(), required: false },
  },
  outputs: [
    {
    kind: "delegation",
    target: { transformPackageId: currency.packageId, transformId: currency.transformId("DepositCurrency") },
    conditions: [{ sourceParameter: "rewardType", operator: "eq", value: "currency" }],
    arguments: {
      count: { kind: "parameter", sourceParameter: "count" },
      currencyType: { kind: "static", value: "" },
      price: { kind: "static", value: 0 },
      slot: { kind: "parameter", sourceParameter: "slot" },
    },
  },
    {
    kind: "delegation",
    target: { transformPackageId: character.packageId, transformId: character.transformId("AcquireCharacter") },
    conditions: [{ sourceParameter: "rewardType", operator: "eq", value: "character" }],
    arguments: {
      character: { kind: "parameter", sourceParameter: "contentsId" },
      count: { kind: "parameter", sourceParameter: "count" },
    },
  },
  ],
});

export const sampleSocialGameBasic = definePackage({
  id: "sample-social-game-basic",
  version: "0.0.1",
  dependencies: {
    "foundation-core-identity": "file:../../../foundation-core-identity/packages/foundation-core-identity",
    "foundation-economy-character": "file:../../../foundation-economy-character/packages/foundation-economy-character",
    "foundation-economy-character-dictionary": "file:../../../foundation-economy-character-dictionary/packages/foundation-economy-character-dictionary",
    "foundation-economy-currency": "file:../../../foundation-economy-currency/packages/foundation-economy-currency",
    "foundation-economy-schedule": "file:../../../foundation-economy-schedule/packages/foundation-economy-schedule",
    "micro-economy-login-reward": "file:../../../micro-economy-login-reward/packages/micro-economy-login-reward",
    "micro-shop-character-gacha": "file:../../../micro-shop-character-gacha/packages/micro-shop-character-gacha",
    "micro-shop-currency": "file:../../../micro-shop-currency/packages/micro-shop-currency",
  },
  domainTypes: [Reward, LoginReward, Gacha],
  instances: [
    instance(character.type("Character"), "character-0001", {
    sort: 1,
  }),
    instance(character.type("Character"), "character-0003", {
    sort: 3,
  }),
    instance(character.type("Character"), "character-0004", {
    sort: 4,
  }),
    instance(character.type("Character"), "character_0002", {
    sort: 2,
  }),
    instance(character.type("Character"), "character_0005", {
    sort: 5,
  }),
    instance(character.type("CharacterCollection"), "charactercollection", {
    maximumCapacity: 1000,
    defaultCapacity: 1000,
  }),
    instance(character.type("CharacterExperience"), "characterexperience", {
    maxLevelCap: 100,
    defaultLevelCap: 100,
    threshold: [10, 30, 90, 270, 810, 2430],
  }),
    instance(currency.type("StoreProduct"), "tier1", {
    [shop.propertyId("StoreProduct", "prices")]: [
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "JPY",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 100,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "USD",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 1,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "XXX",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 1,
      },
    ],
    appleAppStoreProductId: "io.gs2.sample",
    [shop.propertyId("StoreProduct", "count")]: 10,
    googlePlayProductId: "io.gs2.sample",
  }),
    instance(currency.type("StoreProduct"), "tier2", {
    [shop.propertyId("StoreProduct", "prices")]: [
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "JPY",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 200,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "USD",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 2,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "XXX",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 2,
      },
    ],
    appleAppStoreProductId: "io.gs2.sample",
    [shop.propertyId("StoreProduct", "count")]: 50,
    googlePlayProductId: "io.gs2.sample",
  }),
    instance(currency.type("StoreProduct"), "tier3", {
    [shop.propertyId("StoreProduct", "prices")]: [
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "JPY",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 300,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "USD",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 3,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "XXX",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 3,
      },
    ],
    appleAppStoreProductId: "io.gs2.sample",
    [shop.propertyId("StoreProduct", "count")]: 250,
    googlePlayProductId: "io.gs2.sample",
  }),
    instance(currency.type("StoreProduct"), "tier4", {
    [shop.propertyId("StoreProduct", "prices")]: [
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "JPY",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 400,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "USD",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 4,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "XXX",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 4,
      },
    ],
    appleAppStoreProductId: "io.gs2.sample",
    [shop.propertyId("StoreProduct", "count")]: 1250,
    googlePlayProductId: "io.gs2.sample",
  }),
    instance(currency.type("StoreProduct"), "tier5", {
    [shop.propertyId("StoreProduct", "prices")]: [
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "JPY",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 500,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "USD",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 5,
      },
      {
        [shop.elementPropertyId("StoreProduct", ["prices"], "currencyType")]: "XXX",
        [shop.elementPropertyId("StoreProduct", ["prices"], "price")]: 5,
      },
    ],
    appleAppStoreProductId: "io.gs2.sample",
    [shop.propertyId("StoreProduct", "count")]: 6000,
    googlePlayProductId: "io.gs2.sample",
  }),
    instance(currency.type("Wallet"), "0", {}),
    instance(currency.type("Wallet"), "1", {}),
    instance(schedule.type("Schedule"), "login-bonus-event", {
    endAt: "2025-01-01T00:00:00.000Z",
    scheduleType: "absolute",
    repeatType: "always",
    startAt: "2024-01-01T00:00:00.000Z",
  }),
    instance(LoginReward, "always_day1", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 10,
  }),
    instance(LoginReward, "always_day2", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 20,
  }),
    instance(LoginReward, "always_day3", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 30,
    contentsId: "",
  }),
    instance(LoginReward, "always_day4", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 40,
    contentsId: "",
  }),
    instance(LoginReward, "always_day5", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 50,
    contentsId: "",
  }),
    instance(LoginReward, "always_day6", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 60,
    contentsId: "",
  }),
    instance(LoginReward, "always_day7", {
    loginRewardCollection: "always",
    rewardType: "currency",
    count: 70,
    contentsId: "",
  }),
    instance(loginReward.type("LoginRewardCollection"), "always", {
    mode: "schedule",
    schedule: "login-bonus-event",
    resetHour: 9,
  }),
    instance(gacha.type("CharacterRate"), "n.character-0004", {
    weight: 1,
    rarity: "n",
    character: "character-0004",
  }),
    instance(gacha.type("CharacterRate"), "r.character_0005", {
    weight: 1,
    rarity: "r",
    character: "character_0005",
  }),
    instance(gacha.type("CharacterRate"), "sr.character-0003", {
    weight: 1,
    rarity: "sr",
    character: "character-0003",
  }),
    instance(gacha.type("CharacterRate"), "sr.character_0002", {
    weight: 1,
    rarity: "sr",
    character: "character_0002",
  }),
    instance(gacha.type("CharacterRate"), "ssr.character-0001", {
    weight: 1,
    rarity: "ssr",
    character: "character-0001",
  }),
    instance(Gacha, "premium.10", {
    price: 300,
    paidOnly: false,
    series: "premium",
    drawCount: 10,
  }),
    instance(gacha.type("GachaRarity"), "n", {}),
    instance(gacha.type("GachaRarity"), "r", {}),
    instance(gacha.type("GachaRarity"), "sr", {}),
    instance(gacha.type("GachaRarity"), "ssr", {}),
    instance(gacha.type("GachaRarityRate"), "premium.10.n", {
    gacha: "premium.10",
    weight: 60,
    rarity: "n",
  }),
    instance(gacha.type("GachaRarityRate"), "premium.10.r", {
    gacha: "premium.10",
    weight: 27,
    rarity: "r",
  }),
    instance(gacha.type("GachaRarityRate"), "premium.10.sr", {
    gacha: "premium.10",
    weight: 10,
    rarity: "sr",
  }),
    instance(gacha.type("GachaRarityRate"), "premium.10.ssr", {
    gacha: "premium.10",
    weight: 3,
    rarity: "ssr",
  }),
    instance(Reward, "currency", {
    iconAddress: "icon/currency.asset",
    labelKey: "reward.currency",
  }),
  ],
  overlayInstances: [
    overlayInstance(currency.type("CurrencyStore"), "currencystore", {
    overrides: {
      enableFakeReceipt: "Accept",
    },
    suppressed: false,
  }),
  ],
  actionTransforms: [RewardTransform],
});
