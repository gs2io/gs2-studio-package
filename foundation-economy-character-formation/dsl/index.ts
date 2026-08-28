import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

/** One occupied slot of a saved formation; the row carries the held character. */
const CharacterFormationFormSlot = defineDomainType("CharacterFormationFormSlot", dt =>
  dt.idDescription("Unique identifier").property(PT.string("propertyId").userData().required())
);

/** One saved formation (a "form"), holding its slots inline. */
const CharacterFormationForm = defineDomainType("CharacterFormationForm", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("slots", PT.listOf(PT.inline("CharacterFormationFormSlot"))).userData())
);

/** Slot definition: which characters a slot accepts. */
const CharacterFormationSlot = defineDomainType("CharacterFormationSlot", dt =>
  dt.idDescription("Unique identifier").property(PT.string("propertyRegex").masterData())
);

/** The formation feature itself: how many save areas a player has. */
const CharacterFormation = defineDomainType("CharacterFormation", dt =>
  dt
    .idDescription("Unique identifier")
    .singleEntry()
    .property(PT.int32("initialSaveArea").masterData().required())
    .property(PT.int32("maximumSaveArea").masterData().required())
    .property(PT.int32("currentSaveArea").userData().required())
);

const FormModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.formation.FormModel)
    .bindings({
      metadata: Bind.static(""),
      name: Bind.static("CharacterFormation"),
    })
    .addArrayChild("slots", slotModel => {
      slotModel
        .model(GS2.formation.SlotModel)
        .mountLocal(CharacterFormationSlot)
        .bindings({
          name: Bind.domainProperty(Source.direct(CharacterFormationSlot, "id")),
          propertyRegex: Bind.domainProperty(
            Source.direct(CharacterFormationSlot, "propertyRegex")
          ),
        });
    })
);

const MoldModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.formation.MoldModel)
    .mountLocal(CharacterFormation)
    .bindings({
      name: Bind.static("CharacterFormation"),
      initialMaxCapacity: Bind.domainProperty(Source.direct(CharacterFormation, "initialSaveArea")),
      maxCapacity: Bind.domainProperty(Source.direct(CharacterFormation, "maximumSaveArea")),
    })
    .addArrayChild("formModel", FormModel)
);

export const foundationEconomyCharacterFormation = definePackage(
  "foundation-economy-character-formation",
  "0.0.0"
)
  .display({
    label: { ja: "パーティ編成", en: "Party Formation" },
    description: {
      ja: "手持ちキャラクターを組み合わせて編成を作る機能です。",
      en: "Lets players build formations by combining characters from their collection.",
    },
  })
  .displayType(CharacterFormationFormSlot, {
    label: { ja: "フォームスロット", en: "Form slot" },
    description: {
      ja: "保存した編成の各スロットに配置されているキャラクターを管理します。",
      en: "Tracks the character assigned to each slot in a saved formation.",
    },
  })
  .displayType(CharacterFormationForm, {
    label: { ja: "編成フォーム", en: "Formation form" },
    description: {
      ja: "プレイヤーが保存した1つの編成と、そのスロット構成を管理します。",
      en: "Stores one player formation together with its slot assignments.",
    },
  })
  .displayType(CharacterFormationSlot, {
    label: { ja: "編成スロット", en: "Formation slot" },
    description: {
      ja: "編成スロットごとに配置できるキャラクターの条件を設定します。",
      en: "Defines which characters are eligible for each formation slot.",
    },
  })
  .displayType(CharacterFormation, {
    label: { ja: "編成", en: "Formation" },
    description: {
      ja: "編成の初期保存枠数、最大枠数、現在の枠数を管理します。",
      en: "Manages the initial, maximum, and current number of saved formation slots.",
    },
  })
  .dependency("foundation-economy-character", "github:gs2io/gs2-studio-package")
  .domainType(CharacterFormationFormSlot)
  .domainType(CharacterFormationForm)
  .domainType(CharacterFormationSlot)
  .domainType(CharacterFormation)

  .masterDataResource(r =>
    r
      .model(GS2.formation.Namespace)
      .bindings({
        name: Bind.static("CharacterFormation"),
        logSetting: Bind.null(),
        updateFormScript: Bind.null(),
        updateMoldScript: Bind.null(),
        updatePropertyFormScript: Bind.null(),
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
      .addChild(MoldModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.formation.Form)
      .mountLocal(CharacterFormationForm)
      .bindings({
        formId: Bind.skip(),
        index: Bind.domainProperty(Source.direct(CharacterFormationForm, "id")),
        name: Bind.static("CharacterFormation"),
      })
      .modelArrayDecodeBinding(
        "slots",
        CharacterFormationForm,
        "slots",
        [{ fieldName: "propertyId", targetPropertyName: "propertyId" }],
        "name"
      )
  )

  .userDataResource(r =>
    r
      .model(GS2.formation.Mold)
      .linkedMasterResourceId(MoldModel)
      .bindings({
        capacity: Bind.domainProperties([Source.direct(CharacterFormation, "currentSaveArea")]),
        moldId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      })
  )

  .actionTransform("AcquireToCharacterFormation", at =>
    at
      .category("acquire")
      .parameter("index", { type: PT.int32() })
      .output("Gs2Formation:AcquireActionsToFormProperties", o =>
        o
          .resourceRef(() => FormModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("moldModelName")
          .mapParameter("index", "index")
          .mapStatic("acquireAction.action", "")
          .mapStatic("acquireAction.request", "")
      )
  )
  .actionTransform("IncreaseSaveArea", at =>
    at
      .category("acquire")
      .parameter("value", { type: PT.int32() })
      .output("Gs2Formation:AddMoldCapacityByUserId", o =>
        o
          .resourceRef(() => FormModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapResourceKey("moldModelName")
          .mapParameter("capacity", "value")
      )
  )
  .build();
