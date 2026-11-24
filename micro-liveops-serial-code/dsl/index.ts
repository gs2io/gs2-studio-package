import {
  Bind,
  defineActionTransform,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  OutputMap,
  PT,
  Source,
  transactionSettingV2,
} from "gs2-studio-dsl";

import { GS2 } from "gs2-studio-dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const SerialCodeCampaign = defineDomainType("SerialCodeCampaign", {
  properties: {
    enableCampaignCode: PT.bool().masterData(),
  },
  localizedDisplay: {
    ja: {
      label: "コードキャンペーン",
      description: "キャンペーンコード方式を利用するかどうかを設定します。",
    },
    en: {
      label: "Code campaign",
      description: "Configures whether campaign-code redemption is enabled.",
    },
  },
  localizedProperties: {
    id: jaEnId("コードキャンペーン", "serial-code campaign"),
    enableCampaignCode: jaEnField(
      "共通キャンペーンコード",
      "Shared campaign code",
      "キャンペーン ID を全員共通のコードとして扱うことを示します。現在の GS2 はこの設定に関係なくキャンペーン ID を受け付け、何度でも使えます。",
      "Marks the campaign id as a code shared by every player. GS2 currently accepts the id whatever this says, any number of times."
    ),
  },
});

const CampaignModel = defineMasterDataResource({
  model: GS2.serialKey.CampaignModel,
  mount: SerialCodeCampaign,
  bindings: {
      name: Bind.domainProperty(Source.direct(SerialCodeCampaign, "id")),
      metadata: Bind.static(""),
      enableCampaignCode: Bind.domainProperty(
        Source.direct(SerialCodeCampaign, "enableCampaignCode")
      ),
    },
});

const UseSerialCodeTransform = defineActionTransform("UseSerialCode", {
  category: "consume",
  parameters: {
    code: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2SerialKey:UseByUserId",
    resource: () => CampaignModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      code: OutputMap.parameter("code"),
    },
  },
  ],
});

const VerifySerialCodeActiveTransform = defineActionTransform("VerifySerialCodeActive", {
  category: "verify",
  parameters: {
    campaign: { type: PT.ref(SerialCodeCampaign) },
    code: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2SerialKey:VerifyCodeByUserId",
    resource: () => CampaignModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      code: OutputMap.parameter("code"),
      campaignModelName: OutputMap.parameter("campaign"),
      verifyType: OutputMap.static("active"),
    },
  },
  ],
});

const RevertSerialCodeUseTransform = defineActionTransform("RevertSerialCodeUse", {
  category: "acquire",
  parameters: {
    code: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2SerialKey:RevertUseByUserId",
    resource: () => CampaignModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      userId: OutputMap.placeholder("#{userId}"),
      code: OutputMap.parameter("code"),
    },
  },
  ],
});

export const microLiveopsSerialCode = definePackage({
  id: "micro-liveops-serial-code",
  version: "0.0.1",
  display: {
    ja: {
      label: "シリアルコード",
      description: "配布したシリアルコードを引き換えます。コードはキャンペーン単位でまとめます。",
    },
    en: {
      label: "Serial Codes",
      description: "Redeems serial codes you hand out, organized into campaigns.",
    },
  },
  domainTypes: [SerialCodeCampaign],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.serialKey.Namespace,
  bindings: {
        name: Bind.static("SerialCode"),
        logSetting: Bind.null(),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    CampaignModel,
  ],
}),
  ],
  actionTransforms: [UseSerialCodeTransform, VerifySerialCodeActiveTransform, RevertSerialCodeUseTransform],
});
