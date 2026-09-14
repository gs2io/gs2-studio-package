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
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import characterSurface from "../../foundation-economy-character/dsl/dependency-surface.json";
import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const character = dependencyPackage(characterSurface);
const schedule = dependencyPackage(scheduleSurface);

/** Types this package points at but does not overlay. */
const CHARACTER_TYPE_ID = character.typeId("Character");
const SCHEDULE_EVENT_TYPE_ID = schedule.typeId("Schedule");

const GachaRarity = defineDomainType("GachaRarity", dt =>
  dt.localizedProperties({
    id: jaEnId("ガチャレアリティ", "gacha rarity"),
  })
);

/** How likely one character is, within its rarity. */
const CharacterRate = defineDomainType("CharacterRate", dt =>
  dt
    .property(PT.prop("rarity", PT.ref("GachaRarity")).assetDelivery().required())
    .property(PT.prop("character", PT.ref(CHARACTER_TYPE_ID)).assetDelivery().required())
    .property(PT.int32("weight").masterData().required())
    .compositeKey("rarity", "character")
    .localizedProperties({
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
    })
);

/** How likely one rarity is, within one gacha. */
const GachaRarityRate = defineDomainType("GachaRarityRate", dt =>
  dt
    .property(PT.prop("gacha", PT.ref("Gacha")).assetDelivery().required())
    .property(PT.prop("rarity", PT.ref("GachaRarity")).assetDelivery().required())
    .property(PT.int32("weight").masterData().required())
    .compositeKey("gacha", "rarity")
    .localizedProperties({
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
    })
);

const Gacha = defineDomainType("Gacha", dt =>
  dt
    .property(PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID)).assetDelivery())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
    .localizedProperties({
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
    })
);

const LotteryModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.lottery.LotteryModel)
    .mountLocal(Gacha)
    .bindings({
      name: Bind.domainProperty(Source.direct(Gacha, "id")),
      prizeTableName: Bind.domainProperty(Source.direct(Gacha, "id")),
      method: Bind.static("prize_table"),
      mode: Bind.static("normal"),
    })
);

/**
 * One prize table per gacha. Rarity rows draw a nested table; character rows
 * hand out the character itself and record it in the dex.
 */
const PrizeTable = defineMasterDataResource(resource =>
  resource
    .model(GS2.lottery.PrizeTable)
    .mountLocal(Gacha)
    .bindings({
      name: Bind.domainProperty(Source.direct(Gacha, "id")),
    })
    .addArrayChild("prizes", rarityPrize => {
      rarityPrize
        .model(GS2.lottery.Prize)
        .mountLocal(GachaRarityRate)
        .bindings({
          type: Bind.static("prize_table"),
          prizeId: Bind.domainProperty(Source.direct(GachaRarityRate, "id")),
          prizeTableName: Bind.domainProperty(Source.direct(GachaRarityRate, "id")),
          weight: Bind.domainProperty(Source.direct(GachaRarityRate, "weight")),
        });
    })
    .addArrayChild("prizes", characterPrize => {
      characterPrize
        .model(GS2.lottery.Prize)
        .mountLocal(CharacterRate)
        .bindings({
          type: Bind.static("action"),
          prizeId: Bind.domainProperty(Source.direct(CharacterRate, "id")),
          weight: Bind.domainProperty(Source.direct(CharacterRate, "weight")),
        })
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(CharacterRate)
            .bindings({
              action: Bind.transform("foundation-economy-character", "AcquireCharacter", [
                Arg.domainProperty(
                  "character",
                  Source.parent(Source.direct(CharacterRate, "character"))
                ),
                Arg.static("count", 1),
              ]),
            });
        })
        .addArrayChild("acquireActions", dictionaryAction => {
          dictionaryAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(CharacterRate)
            .bindings({
              action: Bind.transform(
                "foundation-economy-character-dictionary",
                "MarkCharacterDictionary",
                [
                  Arg.domainProperty(
                    "character",
                    Source.parent(Source.direct(CharacterRate, "character"))
                  ),
                ]
              ),
            });
        });
    })
);

const DisplayItem = defineMasterDataResource(resource =>
  resource
    .model(GS2.showcase.DisplayItem)
    .mountLocal(Gacha)
    .bindings({
      displayItemId: Bind.domainProperty(Source.direct(Gacha, "id")),
      type: Bind.static("salesItem"),
    })
    .grnFieldMount("salesPeriodEventId", schedule.resourceId("schedule.Namespace"), [
      { grnKeyName: "namespaceName", sourceKeyName: "namespaceName" },
    ])
    .grnKeyBinding(
      "salesPeriodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(Gacha, "schedule"))
    )
    .addArrayChild("salesItem", salesItem => {
      salesItem
        .model(GS2.showcase.SalesItem)
        .mountLocal(Gacha)
        .bindings({
          metadata: Bind.static(""),
          name: Bind.domainProperty(Source.direct(Gacha, "id")),
        })
        .addArrayChild("acquireActions", drawAction => {
          drawAction
            .model(GS2.transaction.AcquireAction)
            .resourceLink(LotteryModel)
            .bindings({
              action: Bind.static("Gs2Lottery:DrawByUserId"),
            })
            // `request` is a JSON blob on the catalog model, so its fields are
            // bound by parameter path rather than through the typed record.
            .domainPropertyBindings({
              request: {
                namespaceName: Bind.resourceKey(),
                lotteryName: Bind.resourceKey(),
                userId: Bind.placeholder("#{userId}"),
                count: Bind.static(1),
                config: Bind.null(),
              },
            });
        })
        .addArrayChild("consumeActions", consumeAction => {
          consumeAction
            .model(GS2.transaction.ConsumeAction)
            .mountLocal(Gacha)
            .bindings({
              action: Bind.domainProperty(Source.parent(Source.direct(Gacha, "consumeActions"))),
            });
        });
    })
);

const Showcase = defineMasterDataResource(resource =>
  resource
    .model(GS2.showcase.Showcase)
    .bindings({
      name: Bind.static("Showcase"),
      salesPeriodEventId: Bind.null(),
    })
    .addArrayChild("displayItems", DisplayItem)
);

export const microShopCharacterGacha = definePackage("micro-shop-character-gacha", "0.0.0")
  .display({
    label: { ja: "キャラガチャ", en: "Character Gacha" },
    description: {
      ja: "通貨を消費してキャラクターを排出するガチャです。排出率をレアリティごとに設定できます。",
      en: "A currency-funded gacha that draws characters, with per-rarity drop rates.",
    },
  })
  .displayType(CharacterRate, {
    label: { ja: "キャラクター排出率", en: "Character rate" },
    description: {
      ja: "レアリティ内で各キャラクターが排出される比率を設定します。",
      en: "Configures each character's draw weight within a rarity tier.",
    },
  })
  .displayType(GachaRarityRate, {
    label: { ja: "レアリティ排出率", en: "Rarity rate" },
    description: {
      ja: "ガチャで各レアリティが選ばれる排出率を設定します。",
      en: "Configures the draw rate for each rarity tier in a gacha.",
    },
  })
  .displayType(GachaRarity, {
    label: { ja: "レアリティ", en: "Rarity" },
    description: {
      ja: "ガチャのレアリティ区分と対象キャラクターを設定します。",
      en: "Defines a gacha rarity tier and the characters assigned to it.",
    },
  })
  .displayType(Gacha, {
    label: { ja: "ガチャ", en: "Gacha" },
    description: {
      ja: "ガチャの開催内容、抽選回数、消費通貨、排出テーブルを設定します。",
      en: "Defines a gacha's availability, draw count, currency cost, and prize table.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-character-dictionary", "github:gs2io/gs2-studio-package")
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .dependency("micro-shop-currency", "github:gs2io/gs2-studio-package")
  .domainType(CharacterRate)
  .domainType(GachaRarityRate)
  .domainType(GachaRarity)
  .domainType(Gacha)

  .masterDataResource(r =>
    r
      .model(GS2.lottery.Namespace)
      .bindings({
        name: Bind.static("CharacterGacha"),
        ...Bind.nulls("lotteryTriggerScriptId", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(LotteryModel)
      .addChild(PrizeTable)
  )

  .masterDataResource(r =>
    r
      .model(GS2.showcase.Namespace)
      .bindings({
        name: Bind.static("CharacterGacha"),
        ...Bind.nulls("buyScript", "logSetting"),
        transactionSetting: transactionSetting(),
      })
      .addChild(Showcase)
  )

  .delegatedAction(Gacha, "Buy", {
    targetActionKey: "Gs2Showcase:DisplayItem.Buy",
    targetResource: DisplayItem,
    parameterOverrides: [],
  })
  .build();
