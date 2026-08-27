import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** Types this package points at but does not overlay. */
const CHARACTER_TYPE_ID = "dt_RJSJ8JFQJXEWGQDWXMPKAW04Y5";
const SCHEDULE_EVENT_TYPE_ID = "dt_55N8HND2SNZV1ZMCJS4NA2BTFD";

const GachaRarity = defineDomainType("GachaRarity", dt => dt.idDescription("Unique identifier"));

/** How likely one character is, within its rarity. */
const CharacterRate = defineDomainType("CharacterRate", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("rarity", PT.ref("GachaRarity")).assetDelivery().required())
    .property(PT.prop("character", PT.ref(CHARACTER_TYPE_ID)).assetDelivery().required())
    .property(PT.int32("weight").masterData().required())
    .compositeKey("rarity", "character")
);

/** How likely one rarity is, within one gacha. */
const GachaRarityRate = defineDomainType("GachaRarityRate", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("gacha", PT.ref("Gacha")).assetDelivery().required())
    .property(PT.prop("rarity", PT.ref("GachaRarity")).assetDelivery().required())
    .property(PT.int32("weight").masterData().required())
    .compositeKey("gacha", "rarity")
);

const Gacha = defineDomainType("Gacha", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("schedule", PT.ref(SCHEDULE_EVENT_TYPE_ID)).assetDelivery())
    .property(PT.prop("consumeActions", PT.listOf(PT.consumeAction())).masterData().required())
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
                {
                  parameterName: "character",
                  source: {
                    kind: "domainProperty",
                    source: Source.parent(Source.direct(CharacterRate, "character")),
                  },
                },
                { parameterName: "count", source: { kind: "static", value: 1 } },
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
                  {
                    parameterName: "character",
                    source: {
                      kind: "domainProperty",
                      source: Source.parent(Source.direct(CharacterRate, "character")),
                    },
                  },
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
    .grnFieldMount("salesPeriodEventId", "6515e9e9-7c2f-58fa-9fa6-0dd2769a9e7d", [
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
  .displayType(CharacterRate, { label: { ja: "キャラクター排出率", en: "Character rate" } })
  .displayType(GachaRarityRate, { label: { ja: "レアリティ排出率", en: "Rarity rate" } })
  .displayType(GachaRarity, { label: { ja: "レアリティ", en: "Rarity" } })
  .displayType(Gacha, { label: { ja: "ガチャ", en: "Gacha" } })
  .dependency(
    "foundation-economy-character",
    "github:gs2io/gs2-studio-package"
  )
  .dependency(
    "foundation-economy-character-dictionary",
    "github:gs2io/gs2-studio-package"
  )
  .dependency(
    "foundation-economy-schedule",
    "github:gs2io/gs2-studio-package"
  )
  .dependency(
    "micro-shop-currency",
    "github:gs2io/gs2-studio-package"
  )
  .domainType(CharacterRate)
  .domainType(GachaRarityRate)
  .domainType(GachaRarity)
  .domainType(Gacha)

  .masterDataResource(r =>
    r
      .model(GS2.lottery.Namespace)
      .bindings({
        name: Bind.static("CharacterGacha"),
        lotteryTriggerScriptId: Bind.null(),
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
      .addChild(LotteryModel)
      .addChild(PrizeTable)
  )

  .masterDataResource(r =>
    r
      .model(GS2.showcase.Namespace)
      .bindings({
        name: Bind.static("CharacterGacha"),
        buyScript: Bind.null(),
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
      .addChild(Showcase)
  )

  .delegatedAction(Gacha, "Buy", {
    targetActionKey: "Gs2Showcase:DisplayItem.Buy",
    targetResource: DisplayItem,
    parameterOverrides: [],
  })
  .build();
