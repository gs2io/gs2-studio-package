/** Supply a free recruit action so a new account can populate the otherwise empty owned-character list. */

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

import { CHARACTER_LEVEL_KEY_PLACEHOLDER } from "../../../dsl/characterLevelKey";
import characterSurface from "../../dsl/dependency-surface.json";

const character = dependencyPackage(characterSurface);

const Character = character.type("Character");
const CharacterCollection = character.type("CharacterCollection");
const CharacterExperience = character.type("CharacterExperience");

const CharacterRecruit = defineDomainType("CharacterRecruit", domainType =>
  domainType
    .property(
      PT.prop("character", PT.ref(character.typeId("Character")))
        .masterData()
        .required()
    )
    .property(PT.prop("extraActions", PT.listOf(PT.acquireAction())).masterData())
    .localizedProperties({
      id: {
        ja: { label: "勧誘", description: "デモでキャラクターを1体入手します。" },
        en: { label: "Recruit", description: "Grants one character in the demo." },
      },
      character: {
        ja: { label: "キャラクター", description: "この勧誘が付与するキャラクターです。" },
        en: { label: "Character", description: "The character this recruit grants." },
      },
      extraActions: {
        ja: {
          label: "追加の獲得アクション",
          description:
            "同時に導入した他のパッケージが、この勧誘に足す獲得アクションです。直接は編集しません。",
        },
        en: {
          label: "Added acquire actions",
          description:
            "Acquire actions other installed packages add to this recruit. Not authored here.",
        },
      },
    })
);

const RecruitRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(CharacterRecruit)
    .bindings({
      name: Bind.domainProperty(Source.direct(CharacterRecruit, "id")),
    })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(CharacterRecruit)
        .bindings({
          action: Bind.transform(character.packageId, "AcquireCharacter", [
            Arg.domainProperty(
              "character",
              Source.parent(Source.direct(CharacterRecruit, "character"))
            ),
            Arg.static("count", 1),
          ]),
        });
    })
    // Leave this binding empty in demo rows so installing the base demo adds no extra acquisition actions.
    .addArrayChild("acquireActions", extraAction => {
      extraAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(CharacterRecruit)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(CharacterRecruit, "extraActions"))
          ),
        });
    })
);

/** Use a separate namespace because training and recruitment derive identical rate names; target the owned instance through click-time config. */
const TrainRateModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.exchange.RateModel)
    .mountLocal(Character)
    .bindings({ name: Bind.domainProperty(Source.direct(Character, "id")) })
    .addArrayChild("acquireActions", acquireAction => {
      acquireAction
        .model(GS2.transaction.AcquireAction)
        .mountLocal(Character)
        .bindings({
          action: Bind.transform(character.packageId, "AcquireCharacterExperience", [
            Arg.placeholder("propertyId", CHARACTER_LEVEL_KEY_PLACEHOLDER),
            Arg.static("value", 40),
          ]),
        });
    })
);

/** Start thresholds at 1 and retain levels above the default cap so grade-up demos can raise the cap without replacing the shared curve. */
const EXPERIENCE_CURVE = [
  1, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 3800, 4400, 5000, 5600, 6200, 6800, 7400,
  8000, 8600, 9200, 9800, 10400, 11000, 11600, 12200, 12800, 13400, 14000, 14600,
];

const ROSTER = ["knight", "mage", "archer", "healer"] as const;

export const foundationEconomyCharacterDemo = definePackage(
  "foundation-economy-character-demo",
  "0.0.0"
)
  .display({
    label: { ja: "キャラクター（デモデータ）", en: "Characters (demo data)" },
    description: {
      ja: "ライブデモ用のキャラクター編成・レベル曲線・所持枠・勧誘を提供します。",
      en: "Supplies the roster, level curve, capacity and recruits used by the live demo.",
    },
  })
  .displayType(CharacterRecruit, {
    label: { ja: "勧誘", en: "Recruit" },
    description: {
      ja: "無償でキャラクターを1体入手できるデモ用の交換です。",
      en: "A demo exchange that grants one character for nothing.",
    },
  })
  .dependency(character.packageId, "github:gs2io/gs2-studio-package")
  .domainType(CharacterRecruit)

  .instance(CharacterExperience, "characterexperience", {
    [character.propertyId("CharacterExperience", "threshold")]: EXPERIENCE_CURVE,
    [character.propertyId("CharacterExperience", "defaultLevelCap")]: 10,
    [character.propertyId("CharacterExperience", "maxLevelCap")]: EXPERIENCE_CURVE.length + 1,
  })
  .instance(CharacterCollection, "charactercollection", {
    [character.propertyId("CharacterCollection", "defaultCapacity")]: 20,
    [character.propertyId("CharacterCollection", "maximumCapacity")]: 100,
  })

  .instance(Character, "knight", { [character.propertyId("Character", "sort")]: 100 })
  .instance(Character, "mage", { [character.propertyId("Character", "sort")]: 200 })
  .instance(Character, "archer", { [character.propertyId("Character", "sort")]: 300 })
  .instance(Character, "healer", { [character.propertyId("Character", "sort")]: 400 })

  .instance("CharacterRecruit", ROSTER[0], { character: ROSTER[0] })
  .instance("CharacterRecruit", ROSTER[1], { character: ROSTER[1] })
  .instance("CharacterRecruit", ROSTER[2], { character: ROSTER[2] })
  .instance("CharacterRecruit", ROSTER[3], { character: ROSTER[3] })

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterRecruit"),
        ...Bind.nulls(
          "acquireAwaitScript",
          "exchangeScript",
          "incrementalExchangeScript",
          "logSetting"
        ),
        // Auto-run executes the grant without requiring a second client request after the exchange.
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(RecruitRateModel)
  )

  .masterDataResource(resource =>
    resource
      .model(GS2.exchange.Namespace)
      .bindings({
        name: Bind.static("CharacterTrain"),
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
      .addChild(TrainRateModel)
  )
  .uiComponent(CharacterRecruit, ui =>
    ui
      .templateLabel(
        "CharacterLabel",
        "Recruit {character}",
        { character: ui.prop("character") },
        { name: "CharacterRecruit" }
      )
      .buttonAction("RecruitButton", "Recruit", undefined, { name: "CharacterRecruit" })
  )

  .uiComponent(Character, ui =>
    ui.buttonAction("TrainButton", "Train", undefined, { name: "Character" })
  )

  // Keep the empty-state hint on the collection because an empty owned list has no row on which to display it.
  .uiComponent(CharacterCollection, ui =>
    ui
      .templateLabel(
        "SlotsLabel",
        "{usage} of {capacity} used",
        { usage: ui.prop("currentCpacityUsage"), capacity: ui.prop("currentCpacity") },
        { name: "CharacterCollection" }
      )
      .label("NoneYetLabel", ui.lit("Recruit a character above to start."), {
        name: "CharacterCollection",
      })
      .activeToggle("OwnsAnyActiveToggle", UiCond.gt(ui.prop("currentCpacityUsage"), ui.lit(0)), {
        name: "CharacterCollection",
      })
  )

  .delegatedAction(CharacterRecruit, "Recruit", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: RecruitRateModel,
    parameterOverrides: [{ kind: "static", parameterName: "count", value: 1 }],
  })

  .delegatedAction(Character, "Train", {
    targetActionKey: "Gs2Exchange:RateModel.Exchange",
    targetResource: TrainRateModel,
    parameterOverrides: [
      { kind: "static", parameterName: "count", value: 1 },
      // Resolve the instance at click time because its propertyId does not exist when the rate model is deployed.
      {
        kind: "listEntries",
        parameterName: "config",
        entries: [
          {
            kind: "fields",
            fields: [
              { name: "key", source: { kind: "static", value: "propertyId" } },
              {
                name: "value",
                source: {
                  kind: "domainProperty",
                  propertyName: character.propertyId("Character", "propertyId"),
                },
              },
            ],
          },
        ],
      },
    ],
  })
  .build();
