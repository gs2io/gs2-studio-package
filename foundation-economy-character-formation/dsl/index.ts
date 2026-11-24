import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  defineUserDataResource,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const CharacterFormationFormSlot = defineDomainType("CharacterFormationFormSlot", {
  properties: {
    propertyId: PT.string().userData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "フォームスロット",
      description: "保存した編成の各スロットに配置されているキャラクターを管理します。",
    },
    en: {
      label: "Form slot",
      description: "Tracks the character assigned to each slot in a saved formation.",
    },
  },
  localizedProperties: {
    id: jaEnId("フォームスロット", "formation form slot"),
    propertyId: jaEnField(
      "キャラクター個体ID",
      "Character instance ID",
      "このスロットに配置されたキャラクター個体の識別子です。",
      "Identifier of the character instance assigned to this slot."
    ),
  },
});

const CharacterFormationForm = defineDomainType("CharacterFormationForm", {
  properties: {
    slots: PT.listOf(PT.inline(CharacterFormationFormSlot)).userData(),
  },
  localizedDisplay: {
    ja: {
      label: "編成フォーム",
      description: "プレイヤーが保存した1つの編成と、そのスロット構成を管理します。",
    },
    en: {
      label: "Formation form",
      description: "Stores one player formation together with its slot assignments.",
    },
  },
  localizedProperties: {
      id: jaEnId("編成フォーム", "formation form"),
      slots: jaEnField(
        "配置スロット",
        "Assigned slots",
        "保存した編成に含まれるキャラクター配置です。",
        "Character assignments contained in the saved formation."
      ),
    },
});

const CharacterFormationSlot = defineDomainType("CharacterFormationSlot", {
  properties: {
    propertyRegex: PT.string().masterData(),
  },
  localizedDisplay: {
    ja: {
      label: "編成スロット",
      description: "編成スロットごとに配置できるキャラクターの条件を設定します。",
    },
    en: {
      label: "Formation slot",
      description: "Defines which characters are eligible for each formation slot.",
    },
  },
  localizedProperties: {
    id: jaEnId("編成スロット", "formation slot"),
    propertyRegex: jaEnField(
      "配置条件",
      "Eligibility pattern",
      "このスロットへ配置できるキャラクター個体IDの正規表現です。",
      "Regular expression matching character instance IDs eligible for this slot."
    ),
  },
});

const CharacterFormation = defineDomainType("CharacterFormation", {
  singleEntry: true,
  properties: {
    initialSaveArea: PT.int32().masterData().required(),
    maximumSaveArea: PT.int32().masterData().required(),
    currentSaveArea: PT.int32().userData().required(),
  },
  localizedDisplay: {
    ja: { label: "編成", description: "編成の初期保存枠数、最大枠数、現在の枠数を管理します。" },
    en: {
      label: "Formation",
      description: "Manages the initial, maximum, and current number of saved formation slots.",
    },
  },
  localizedProperties: {
      id: jaEnId("編成", "formation configuration"),
      initialSaveArea: jaEnField(
        "初期保存枠",
        "Initial save slots",
        "新規プレイヤーに付与する編成保存枠です。",
        "Formation save slots granted to a new player.",
        { ja: "枠", en: "slots" }
      ),
      maximumSaveArea: jaEnField(
        "最大保存枠",
        "Maximum save slots",
        "拡張できる編成保存枠の最大値です。",
        "Maximum number of formation save slots.",
        { ja: "枠", en: "slots" }
      ),
      currentSaveArea: jaEnField(
        "現在の保存枠",
        "Current save slots",
        "プレイヤーが現在利用できる編成保存枠です。",
        "Formation save slots currently available to the player.",
        { ja: "枠", en: "slots" }
      ),
    },
});

const FormModel = defineMasterDataResource({
  model: GS2.formation.FormModel,
  bindings: {
      metadata: Bind.static(""),
      name: Bind.static("CharacterFormation"),
    },
  arrayChildren: {
    slots: [
      defineMasterDataResource({
  model: GS2.formation.SlotModel,
  mount: CharacterFormationSlot,
  bindings: {
          name: Bind.domainProperty(Source.direct(CharacterFormationSlot, "id")),
          propertyRegex: Bind.domainProperty(
            Source.direct(CharacterFormationSlot, "propertyRegex")
          ),
        },
}),
    ],
  },
});

const MoldModel = defineMasterDataResource({
  model: GS2.formation.MoldModel,
  mount: CharacterFormation,
  bindings: {
      name: Bind.static("CharacterFormation"),
      initialMaxCapacity: Bind.domainProperty(Source.direct(CharacterFormation, "initialSaveArea")),
      maxCapacity: Bind.domainProperty(Source.direct(CharacterFormation, "maximumSaveArea")),
    },
  arrayChildren: {
    formModel: [
      FormModel,
    ],
  },
});

const AcquireToCharacterFormationTransform = defineActionTransform("AcquireToCharacterFormation", {
  category: "acquire",
  parameters: {
    index: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Formation:AcquireActionsToFormProperties",
    resource: () => FormModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      moldModelName: OutputMap.resourceKey(),
      index: OutputMap.parameter("index"),
      "acquireAction.action": OutputMap.static(""),
      "acquireAction.request": OutputMap.static(""),
    },
  },
  ],
});

const IncreaseSaveAreaTransform = defineActionTransform("IncreaseSaveArea", {
  category: "acquire",
  parameters: {
    value: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Formation:AddMoldCapacityByUserId",
    resource: () => FormModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      moldModelName: OutputMap.resourceKey(),
      capacity: OutputMap.parameter("value"),
    },
  },
  ],
});

export const foundationEconomyCharacterFormation = definePackage({
  id: "foundation-economy-character-formation",
  version: "0.0.1",
  display: {
    ja: {
      label: "パーティ編成",
      description: "手持ちのキャラクターを組み合わせて編成を作ります。",
    },
    en: {
      label: "Party Formation",
      description: "Lets players build formations by combining characters from their collection.",
    },
  },
  dependencies: {
    "foundation-economy-character": "github:gs2io/gs2-studio-package",
  },
  domainTypes: [CharacterFormationFormSlot, CharacterFormationForm, CharacterFormationSlot, CharacterFormation],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.formation.Namespace,
  bindings: {
        name: Bind.static("CharacterFormation"),
        ...Bind.nulls(
          "logSetting",
          "updateFormScript",
          "updateMoldScript",
          "updatePropertyFormScript"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    MoldModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.formation.Form,
  mount: CharacterFormationForm,
  bindings: {
        formId: Bind.skip(),
        index: Bind.domainProperty(Source.direct(CharacterFormationForm, "id")),
        name: Bind.static("CharacterFormation"),
      },
  modelArrayDecodeBindings: [
    { parameterName: "slots", target: CharacterFormationForm, targetListProperty: "slots", fieldMappings: [{ fieldName: "propertyId", targetProperty: "propertyId" }], idSourceField: "name" },
  ],
}),
    defineUserDataResource({
  model: GS2.formation.Mold,
  linkedMaster: MoldModel,
  bindings: {
        capacity: Bind.domainProperties([Source.direct(CharacterFormation, "currentSaveArea")]),
        moldId: Bind.skip(),
        name: Bind.skip(),
        userId: Bind.skip(),
      },
}),
  ],
  actionTransforms: [AcquireToCharacterFormationTransform, IncreaseSaveAreaTransform],
});
