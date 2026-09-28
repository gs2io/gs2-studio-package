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

/**
 * A batch of redeemable codes — a launch giveaway, an apology gift, a code
 * printed on a physical item. Per-player codes are issued at runtime and are
 * not authored here; what a project authors is the campaign they belong to,
 * and the reward is whatever transaction the redeeming flow runs.
 *
 * The campaign's own id is also a code: GS2 accepts it from every player, any
 * number of times, and records nothing when it is used. A title that wants it
 * once per player counts the uses itself.
 */
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
      ja: "配布したシリアルコードを引き換える機能です。コードのまとまり（キャンペーン）を定義します。",
      en: "Redeems serial codes you hand out, organised into campaigns.",
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
