import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const SerialCodeCampaign = defineDomainType("SerialCodeCampaign", dt =>
  dt
    .property(
      PT.bool("enableCampaignCode")
        .masterData()
        .description(
          "Mark the campaign id as a shared code; GS2 currently accepts the id whether or not this is set"
        )
    )
    .localizedProperties({
      id: jaEnId("コードキャンペーン", "serial-code campaign"),
      enableCampaignCode: jaEnField(
        "共通キャンペーンコード",
        "Shared campaign code",
        "キャンペーン ID を全員共通のコードとして扱うことを示します。現在の GS2 はこの設定に関係なくキャンペーン ID を受け付け、何度でも使えます。",
        "Marks the campaign id as a code shared by every player. GS2 currently accepts the id whatever this says, any number of times."
      ),
    })
);

const CampaignModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.serialKey.CampaignModel)
    .mountLocal(SerialCodeCampaign)
    .bindings({
      name: Bind.domainProperty(Source.direct(SerialCodeCampaign, "id")),
      metadata: Bind.static(""),
      enableCampaignCode: Bind.domainProperty(
        Source.direct(SerialCodeCampaign, "enableCampaignCode")
      ),
    })
);

export const microLiveopsSerialCode = definePackage("micro-liveops-serial-code", "0.0.0")
  .display({
    label: { ja: "シリアルコード", en: "Serial Codes" },
    description: {
      ja: "配布したシリアルコードを引き換えます。コードはキャンペーン単位でまとめます。",
      en: "Redeems serial codes you hand out, organized into campaigns.",
    },
  })
  .displayType(SerialCodeCampaign, {
    label: { ja: "コードキャンペーン", en: "Code campaign" },
    description: {
      ja: "キャンペーンコード方式を利用するかどうかを設定します。",
      en: "Configures whether campaign-code redemption is enabled.",
    },
  })
  .domainType(SerialCodeCampaign)

  .masterDataResource(r =>
    r
      .model(GS2.serialKey.Namespace)
      .bindings({
        name: Bind.static("SerialCode"),
        logSetting: Bind.null(),
        transactionSetting: transactionSetting(),
      })
      .addChild(CampaignModel)
  )

  .actionTransform("UseSerialCode", at =>
    at
      .category("consume")
      .parameter("code", { type: PT.string() })
      .output("Gs2SerialKey:UseByUserId", o =>
        o
          .resourceRef(() => CampaignModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("code", "code")
      )
  )
  .actionTransform("VerifySerialCodeActive", at =>
    at
      .category("verify")
      .parameter("campaign", { type: PT.ref("SerialCodeCampaign") })
      .parameter("code", { type: PT.string() })
      .output("Gs2SerialKey:VerifyCodeByUserId", o =>
        o
          .resourceRef(() => CampaignModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("code", "code")
          .mapParameter("campaignModelName", "campaign")
          .mapStatic("verifyType", "active")
      )
  )
  .actionTransform("RevertSerialCodeUse", at =>
    at
      .category("acquire")
      .parameter("code", { type: PT.string() })
      .output("Gs2SerialKey:RevertUseByUserId", o =>
        o
          .resourceRef(() => CampaignModel)
          .mapResourceKey("namespaceName")
          .mapPlaceholder("userId", "#{userId}")
          .mapParameter("code", "code")
      )
  )
  .build();
