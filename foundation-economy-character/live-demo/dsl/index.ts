/**
 * Live demo content for `foundation-economy-character`.
 *
 * The feature package defines the character model but ships no rows — a title
 * supplies its own roster, level curve and inventory size. This package
 * provides a small roster, and a way to actually get one: a visitor arrives
 * owning nothing, so a page that only lists what they have would be empty.
 */

import {
  Arg,
  Bind,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import characterSurface from "../../dsl/dependency-surface.json";

// Materialization publishes the feature package's identities, so everything
// below is addressed by name; a typo is a compile error rather than an id that
// resolves to nothing.
const character = dependencyPackage(characterSurface);

const Character = defineOverlayDomainType(
  "Character",
  character.overlay("Character"),
  domainType => domainType
);
const CharacterCollection = defineOverlayDomainType(
  "CharacterCollection",
  character.overlay("CharacterCollection"),
  domainType => domainType
);
const CharacterExperience = defineOverlayDomainType(
  "CharacterExperience",
  character.overlay("CharacterExperience"),
  domainType => domainType
);

/**
 * One character a visitor can recruit. The row names the character it grants,
 * which is what the exchange hands to `AcquireCharacter`.
 */
const CharacterRecruit = defineDomainType("CharacterRecruit", domainType =>
  domainType
    .property(
      PT.prop("character", PT.ref(character.typeId("Character")))
        .masterData()
        .required()
    )
    .localizedProperties({
      id: {
        ja: { label: "勧誘", description: "デモでキャラクターを1体入手します。" },
        en: { label: "Recruit", description: "Grants one character in the demo." },
      },
      character: {
        ja: { label: "キャラクター", description: "この勧誘が付与するキャラクターです。" },
        en: { label: "Character", description: "The character this recruit grants." },
      },
    })
);

/**
 * An exchange rate that costs nothing and grants one character, so a visitor
 * has something to look at within a few seconds of arriving.
 */
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
);

/**
 * Training grants experience to one character the visitor already owns.
 *
 * The rate is named after the character because a delegated action on
 * `Character` must target a resource that mounts `Character` — that is how the
 * generated loader learns which rate to exchange. The grant's target is the
 * character's `propertyId`, an item set GRN GS2 mints at recruit time, so the
 * row carries a `#{propertyId}` placeholder and the click fills it.
 *
 * It lives under its own exchange namespace because `RecruitRateModel` names
 * its rows after the `CharacterRecruit` rows, and those ids are identical to
 * these; sharing a namespace collides the `rateModels` array on its primary
 * key and drops the whole `CurrentRateMaster` from the template.
 */
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
            Arg.placeholder("propertyId", "#{propertyId}"),
            Arg.static("value", 40),
          ]),
        });
    })
);

/**
 * A gentle curve: ten levels reachable inside a short demo session, with
 * headroom left so the level cap sits visibly below the maximum. GS2 rejects
 * a threshold below 1, so the first entry starts at 1 rather than 0.
 */
const EXPERIENCE_CURVE = [1, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

/** The roster, in the order a visitor reads it. */
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
  .domainType(Character)
  .domainType(CharacterCollection)
  .domainType(CharacterExperience)
  .domainType(CharacterRecruit)

  .instance("CharacterExperience", "characterexperience", {
    [character.propertyId("CharacterExperience", "threshold")]: EXPERIENCE_CURVE,
    [character.propertyId("CharacterExperience", "defaultLevelCap")]: 10,
    [character.propertyId("CharacterExperience", "maxLevelCap")]: 50,
  })
  .instance("CharacterCollection", "charactercollection", {
    [character.propertyId("CharacterCollection", "defaultCapacity")]: 20,
    [character.propertyId("CharacterCollection", "maximumCapacity")]: 100,
  })

  .instance("Character", "knight", { [character.propertyId("Character", "sort")]: 100 })
  .instance("Character", "mage", { [character.propertyId("Character", "sort")]: 200 })
  .instance("Character", "archer", { [character.propertyId("Character", "sort")]: 300 })
  .instance("Character", "healer", { [character.propertyId("Character", "sort")]: 400 })

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
        // The demo runs the transaction server-side and commits it atomically.
        // With auto-run off, `Exchange` only hands back a stamp sheet the
        // client has to execute through the distributor — an extra round trip
        // that can leave a grant half-applied if the page is closed mid-way.
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
  // The label says which character; the button recruits it. Both are generated
  // components a scene wires in the Inspector, which is the point of the demo:
  // nothing here needs a script of its own.
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

  // One button on the character itself, beside the experience gauge.
  .uiComponent(Character, ui =>
    ui.buttonAction("TrainButton", "Train", undefined, { name: "Character" })
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
      // Fills the row's `#{propertyId}` placeholder with the character the
      // button is mounted on. The value is minted by GS2 at recruit time, so
      // it can only be read off the model at the moment of the click.
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
