import {
  ActionProgram,
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

import dictionarySurface from "../../foundation-economy-character-dictionary/dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const dictionary = dependencyPackage(dictionarySurface);

const schedule = dependencyPackage(scheduleSurface);

const Character = character.type("Character");

const Schedule = schedule.type("Schedule");

const GachaRarity = defineDomainType("GachaRarity", {
  localizedDisplay: {
    ja: {
      label: "レアリティ",
      description: "ガチャのレアリティ区分と対象キャラクターを設定します。",
    },
    en: {
      label: "Rarity",
      description: "Defines a gacha rarity tier and the characters assigned to it.",
    },
  },
  localizedProperties: {
    id: jaEnId("ガチャレアリティ", "gacha rarity"),
  },
});

const CharacterRate = defineDomainType("CharacterRate", {
  properties: {
    rarity: PT.ref(GachaRarity).assetDelivery().required(),
    character: PT.ref(Character).assetDelivery().required(),
    weight: PT.int32().masterData().required(),
  },
  compositeKey: ["rarity", "character"],
  localizedDisplay: {
    ja: {
      label: "キャラクター排出率",
      description: "レアリティ内で各キャラクターが排出される比率を設定します。",
    },
    en: {
      label: "Character rate",
      description: "Configures each character's draw weight within a rarity tier.",
    },
  },
  localizedProperties: {
      id: jaEnId("キャラクター排出率", "character draw rate"),
      rarity: jaEnField(
        "レアリティ",
        "Rarity",
        "このキャラクターが属するガチャレアリティです。",
        "Gacha rarity this character belongs to."
      ),
      character: jaEnField(
        "キャラクター",
        "Character",
        "排出対象にするキャラクターです。",
        "Character included in the draw pool."
      ),
      weight: jaEnField(
        "抽選重み",
        "Draw weight",
        "同じレアリティ内でこのキャラクターが選ばれる相対的な重みです。",
        "Relative weight used to draw this character within its rarity."
      ),
    },
});

const GachaRarityRate = defineDomainType("GachaRarityRate", {
  properties: {
    gacha: PT.ref(() => Gacha).assetDelivery().required(),
    rarity: PT.ref(GachaRarity).assetDelivery().required(),
    weight: PT.int32().masterData().required(),
  },
  compositeKey: ["gacha", "rarity"],
  localizedDisplay: {
    ja: {
      label: "レアリティ排出率",
      description: "ガチャで各レアリティが選ばれる排出率を設定します。",
    },
    en: {
      label: "Rarity rate",
      description: "Configures the draw rate for each rarity tier in a gacha.",
    },
  },
  localizedProperties: {
      id: jaEnId("レアリティ排出率", "rarity draw rate"),
      gacha: jaEnField(
        "対象ガチャ",
        "Gacha",
        "この排出率を適用するガチャです。",
        "Gacha to which this rarity rate applies."
      ),
      rarity: jaEnField(
        "レアリティ",
        "Rarity",
        "排出率を設定するガチャレアリティです。",
        "Gacha rarity whose rate is configured."
      ),
      weight: jaEnField(
        "抽選重み",
        "Draw weight",
        "このレアリティが選ばれる相対的な重みです。",
        "Relative weight used to draw this rarity."
      ),
    },
});

const Gacha = defineDomainType("Gacha", {
  properties: {
    schedule: PT.ref(Schedule).assetDelivery(),
    consumeActions: PT.listOf(PT.consumeAction()).masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ガチャ",
      description: "ガチャの開催内容、抽選回数、消費通貨、排出テーブルを設定します。",
    },
    en: {
      label: "Gacha",
      description: "Defines a gacha's availability, draw count, currency cost, and prize table.",
    },
  },
  localizedProperties: {
      id: jaEnId("ガチャ", "gacha"),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このガチャを開催するスケジュールです。",
        "Schedule during which this gacha is available."
      ),
      consumeActions: jaEnField(
        "1回の抽選コスト",
        "Draw costs",
        "ガチャを1回実行するときの消費アクションです。",
        "Consume actions executed for one gacha draw."
      ),
    },
});

const LotteryModel = defineMasterDataResource({
  model: GS2.lottery.LotteryModel,
  mount: Gacha,
  bindings: {
      name: Bind.domainProperty(Source.direct(Gacha, "id")),
      prizeTableName: Bind.domainProperty(Source.direct(Gacha, "id")),
      method: Bind.static("prize_table"),
      mode: Bind.static("normal"),
    },
});

const RarityPrizeTable = defineMasterDataResource({
  model: GS2.lottery.PrizeTable,
  mount: GachaRarity,
  bindings: {
      name: Bind.domainProperty(Source.direct(GachaRarity, "id")),
    },
  arrayChildren: {
    prizes: [
      defineMasterDataResource({
  model: GS2.lottery.Prize,
  mount: CharacterRate,
  bindings: {
          type: Bind.static("action"),
          prizeId: Bind.domainProperty(Source.direct(CharacterRate, "id")),
          weight: Bind.domainProperty(Source.direct(CharacterRate, "weight")),
        },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: CharacterRate,
  actionProgram: ActionProgram.transform(
                "foundation-economy-character",
                character.transformId("AcquireCharacter"),
                [
                  Arg.domainProperty(
                    "character",
                    Source.parent(Source.direct(CharacterRate, "character"))
                  ),
                  Arg.static("count", 1),
                ]
              ),
}),
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  mount: CharacterRate,
  actionProgram: ActionProgram.transform(
                "foundation-economy-character-dictionary",
                dictionary.transformId("MarkCharacterDictionary"),
                [
                  Arg.domainProperty(
                    "character",
                    Source.parent(Source.direct(CharacterRate, "character"))
                  ),
                ]
              ),
}),
    ],
  },
}),
    ],
  },
});

const PrizeTable = defineMasterDataResource({
  model: GS2.lottery.PrizeTable,
  mount: Gacha,
  bindings: {
      name: Bind.domainProperty(Source.direct(Gacha, "id")),
    },
  arrayChildren: {
    prizes: [
      defineMasterDataResource({
  model: GS2.lottery.Prize,
  mount: GachaRarityRate,
  bindings: {
          type: Bind.static("prize_table"),
          prizeId: Bind.domainProperty(Source.direct(GachaRarityRate, "id")),
          prizeTableName: Bind.domainProperty(Source.direct(GachaRarityRate, "rarity")),
          weight: Bind.domainProperty(Source.direct(GachaRarityRate, "weight")),
        },
}),
    ],
  },
});

const DisplayItem = defineMasterDataResource({
  model: GS2.showcase.DisplayItem,
  mount: Gacha,
  bindings: {
      displayItemId: Bind.domainProperty(Source.direct(Gacha, "id")),
      type: Bind.static("salesItem"),
    },
  grnFieldMounts: [
    { parameterName: "salesPeriodEventId", mountedResource: schedule.resourceId("schedule.Namespace"), keyMappings: [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ] },
  ],
  grnKeyBindings: [
    { parameterName: "salesPeriodEventId", keyName: "eventName", directive: Bind.domainProperty(Source.direct(Gacha, "schedule")) },
  ],
  arrayChildren: {
    salesItem: [
      defineMasterDataResource({
  model: GS2.showcase.SalesItem,
  mount: Gacha,
  bindings: {
          metadata: Bind.static(""),
          name: Bind.domainProperty(Source.direct(Gacha, "id")),
        },
  arrayChildren: {
    acquireActions: [
      defineMasterDataResource({
  model: GS2.transaction.AcquireAction,
  actionProgram: ActionProgram.concrete("Gs2Lottery:DrawByUserId", {
                namespaceName: Bind.resourceKey(),
                lotteryName: Bind.resourceKey(),
                userId: Bind.placeholder("#{userId}"),
                count: Bind.static(1),
                config: Bind.null(),
              }),
  resourceLink: LotteryModel,
}),
    ],
    consumeActions: [
      defineMasterDataResource({
  model: GS2.transaction.ConsumeAction,
  mount: Gacha,
  actionProgram: ActionProgram.domainProperty(Source.parent(Source.direct(Gacha, "consumeActions"))),
}),
    ],
  },
}),
    ],
  },
});

const Showcase = defineMasterDataResource({
  model: GS2.showcase.Showcase,
  bindings: {
      name: Bind.static("Showcase"),
      salesPeriodEventId: Bind.null(),
    },
  arrayChildren: {
    displayItems: [
      DisplayItem,
    ],
  },
});

export const microShopCharacterGacha = definePackage({
  id: "micro-shop-character-gacha",
  version: "0.0.2",
  display: {
    ja: {
      label: "キャラクターガチャ",
      description:
        "通貨を消費してキャラクターを排出するガチャです。排出率をレアリティごとに設定できます。",
    },
    en: {
      label: "Character Gacha",
      description: "A currency-funded gacha that draws characters, with per-rarity drop rates.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
    "foundation-economy-character-dictionary": "github:gs2io/gs2-studio-package",
    "foundation-economy-schedule": "github:gs2io/gs2-studio-package",
    "foundation-economy-currency": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [CharacterRate, GachaRarityRate, GachaRarity, Gacha],
  delegatedActions: [
    { target: Gacha, methodName: "Buy", action: { targetActionKey: "Gs2Showcase:DisplayItem.Buy", targetResource: DisplayItem, parameterOverrides: [] } },
  ],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.lottery.Namespace,
  bindings: {
        name: Bind.static("CharacterGacha"),
        ...Bind.nulls("lotteryTriggerScriptId", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    LotteryModel,
    PrizeTable,
    RarityPrizeTable,
  ],
}),
    defineMasterDataResource({
  model: GS2.showcase.Namespace,
  bindings: {
        name: Bind.static("CharacterGacha"),
        ...Bind.nulls("buyScript", "logSetting"),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    Showcase,
  ],
}),
  ],
});
