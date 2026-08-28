import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

/**
 * A batch of redeemable codes — a launch giveaway, an apology gift, a code
 * printed on a physical item. The codes themselves are issued at runtime and
 * are not authored here; what a project authors is the campaign they belong
 * to, and the reward is whatever transaction the redeeming flow runs.
 */
const SerialCodeCampaign = defineDomainType("SerialCodeCampaign", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.bool("enableCampaignCode")
        .masterData()
        .description("Accept one shared code for the whole campaign instead of per-player codes")
    )
    .localizedProperties({
      id: jaEnId("コードキャンペーン", "serial-code campaign"),
      enableCampaignCode: jaEnField(
        "共通キャンペーンコード",
        "Shared campaign code",
        "キャンペーン全体で共通のコードを利用できるかを設定します。",
        "Whether one shared code may be used for the entire campaign."
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
