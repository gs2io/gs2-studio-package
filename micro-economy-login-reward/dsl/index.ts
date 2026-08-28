import {
  Bind,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineDomainType,
  defineUserDataResource,
  PT,
  Source,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

const LoginRewardCollection = defineDomainType("LoginRewardCollection", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("schedule", PT.ref("Schedule")).assetDelivery().required())
    .property(PT.int32("resetHour").masterData().required())
);

const LoginReward = defineDomainType("LoginReward", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.prop("loginRewardCollection", PT.ref("LoginRewardCollection")).assetDelivery().required()
    )
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).masterData().required())
    .property(PT.prop("receivedSteps", PT.listOf(PT.bool())).userData().required())
);

const Schedule = defineOverlayDomainType("Schedule", {
  source: {
    kind: "dependency",
    directSourcePackageId: "foundation-economy-schedule",
    directSourceTypeId: "dt_55N8HND2SNZV1ZMCJS4NA2BTFD",
    sourcePackageId: "foundation-economy-schedule",
    sourceTypeId: "dt_55N8HND2SNZV1ZMCJS4NA2BTFD",
  },
});

const BonusModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.loginReward.BonusModel)
    .mountLocal(LoginRewardCollection)
    .bindings({
      mode: Bind.static("schedule"),
      name: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")),
      resetHour: Bind.domainProperty(Source.direct(LoginRewardCollection, "resetHour")),
    })
    .grnKeyBinding("periodEventId", "namespaceName", Bind.static("Schedule"))
    .grnKeyBinding(
      "periodEventId",
      "eventName",
      Bind.domainProperty(Source.direct(LoginRewardCollection, "schedule"))
    )
    .addArrayChild("rewards", reward => {
      reward
        .model(GS2.loginReward.Reward)
        .mountLocal(LoginReward)
        .bindings({})
        .addArrayChild("acquireActions", acquireAction => {
          acquireAction
            .model(GS2.transaction.AcquireAction)
            .mountLocal(LoginReward)
            .bindings({
              action: Bind.domainProperty(
                Source.parent(Source.direct(LoginReward, "acquireActions"))
              ),
            });
        });
    })
);

const ReceiveStatus = defineUserDataResource(resource =>
  resource
    .model(GS2.loginReward.ReceiveStatus)
    .mountLocal(LoginReward)
    .linkedMasterResourceId(BonusModel)
    .bindings({
      bonusModelName: Bind.skip(),
      receiveStatusId: Bind.skip(),
      receivedSteps: Bind.domainProperties([Source.direct(LoginReward, "receivedSteps")]),
      userId: Bind.skip(),
    })
);

export const microEconomyLoginReward = definePackage("micro-economy-login-reward", "0.0.0")
  .display({
    label: { ja: "ログインボーナス", en: "Login Rewards" },
    description: {
      ja: "毎日・連続ログインなどに応じて報酬を配布します。",
      en: "Grants rewards for daily or consecutive-day logins.",
    },
  })
  .displayType(LoginRewardCollection, {
    label: { ja: "ログインボーナスグループ", en: "Login reward group" },
    description: {
      ja: "ログインボーナスをまとめるグループと開催スケジュールを設定します。",
      en: "Groups login rewards and associates them with an availability schedule.",
    },
  })
  .displayType(LoginReward, {
    label: { ja: "ログインボーナス", en: "Login reward" },
    description: {
      ja: "ログイン日数ごとに付与する報酬内容を設定します。",
      en: "Defines the rewards granted for each login day.",
    },
  })
  .displayType(Schedule, {
    label: { ja: "スケジュール", en: "Schedule" },
    description: {
      ja: "ログインボーナスを利用できる開催期間を参照します。",
      en: "References the period during which a login reward campaign is available.",
    },
  })
  .dependency("foundation-economy-schedule", "github:gs2io/gs2-studio-package")
  .domainType(LoginRewardCollection)
  .domainType(LoginReward)
  .domainType(Schedule)
  .masterDataResource(r =>
    r
      .model(GS2.loginReward.Namespace)
      .bindings({
        logSetting: Bind.null(),
        name: Bind.static("LoginReward"),
        receiveScript: Bind.null(),
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
      .addChild(BonusModel)
  )
  .userDataResource(ReceiveStatus)

  .delegatedAction(LoginReward, "Receive", {
    targetActionKey: "Gs2LoginReward:ReceiveStatus.Receive",
    targetResource: ReceiveStatus,
  })
  .build();
