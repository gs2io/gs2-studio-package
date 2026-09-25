import {
  Bind,
  Cond,
  defineDomainType,
  defineMasterDataResource,
  defineOverlayDomainType,
  definePackage,
  defineUserDataResource,
  dependencyPackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

import scheduleSurface from "../../foundation-economy-schedule/dsl/dependency-surface.json";

// Addressed by name against the identities the dependency publishes, so a
// mistake is a compile error rather than an id that resolves to nothing.
const schedule = dependencyPackage(scheduleSurface);

// GS2 keeps one receive status per bonus model and decides the step itself,
// so the status and both presses live on the group, not on a reward row.
// "schedule" counts days from the schedule's start; "streaming" counts the
// days the player has claimed, advancing at resetHour (UTC).
const LoginRewardCollection = defineDomainType("LoginRewardCollection", dt =>
  dt
    .property(PT.prop("mode", PT.enum("schedule", "streaming")).masterData().required())
    .property(
      PT.prop("schedule", PT.ref("Schedule"))
        .assetDelivery()
        .requiredWhen(Cond.eq("mode", "schedule"))
    )
    .property(PT.int32("resetHour").masterData().requiredWhen(Cond.eq("mode", "streaming")))
    .property(
      PT.prop("repeat", PT.enum("enabled", "disabled"))
        .masterData()
        .requiredWhen(Cond.eq("mode", "streaming"))
    )
    .property(PT.prop("missedReceiveRelief", PT.enum("enabled", "disabled")).masterData())
    // Not tied to missedReceiveRelief: an empty list is a valid free relief, and
    // GS2 drops the list from the deployed model while relief is disabled.
    .property(
      PT.prop("missedReceiveReliefConsumeActions", PT.listOf(PT.consumeAction())).masterData()
    )
    .property(PT.prop("receivedSteps", PT.listOf(PT.bool())).userData())
    .property(PT.timestamp("lastReceivedAt").userData())
    .localizedProperties({
      id: jaEnId("ログインボーナスグループ", "login reward group"),
      mode: jaEnField(
        "進行モード",
        "Progress mode",
        "schedule は開催開始からの日数で、streaming は受け取った日数で段階を決めます。",
        "schedule picks the step by days since the schedule started; streaming by days claimed."
      ),
      schedule: jaEnField(
        "開催スケジュール",
        "Availability schedule",
        "このログインボーナスを開催するスケジュールです。",
        "Schedule during which this login reward is available."
      ),
      resetHour: jaEnField(
        "日付更新時刻",
        "Daily reset hour",
        "streaming で受け取り日を次の日へ進めるUTC時刻です。開催スケジュールを指定したときは使われません。",
        "UTC hour when streaming moves on to the next day. Not used when a schedule is set.",
        { ja: "時", en: "hour" }
      ),
      repeat: jaEnField(
        "繰り返し",
        "Repeat",
        "streaming で最後の段階まで受け取った後、最初の段階へ戻るかどうかです。有効にすると取り逃し救済は使えません。",
        "Whether streaming returns to the first step after the last one is claimed. Missed-receive relief is unavailable while it is enabled."
      ),
      missedReceiveRelief: jaEnField(
        "取り逃し救済",
        "Missed-receive relief",
        "受け取り損ねた段階を、救済の消費アクションと引き換えに受け取れるようにします。schedule では受け取る段階の指定が必要です。",
        "Lets a player claim a missed step in exchange for the relief consume actions. In schedule mode the step to claim must be given."
      ),
      missedReceiveReliefConsumeActions: jaEnField(
        "救済の消費アクション",
        "Relief consume actions",
        "取り逃した段階を受け取るときに実行する消費アクションです。",
        "Consume actions executed when claiming a missed step."
      ),
      receivedSteps: jaEnField(
        "受取済み段階",
        "Received steps",
        "プレイヤーが受け取り済みの段階を、先頭から順に示します。",
        "Steps the player has claimed, in step order."
      ),
      lastReceivedAt: jaEnField(
        "最終受取日時",
        "Last received at",
        "プレイヤーが最後に報酬を受け取った日時です。",
        "When the player last claimed a reward."
      ),
    })
);

const LoginReward = defineDomainType("LoginReward", dt =>
  dt
    .property(
      PT.prop("loginRewardCollection", PT.ref("LoginRewardCollection")).assetDelivery().required()
    )
    .property(PT.prop("acquireActions", PT.listOf(PT.acquireAction())).masterData().required())
    .localizedProperties({
      id: jaEnId("ログインボーナス", "login reward"),
      loginRewardCollection: jaEnField(
        "ボーナスグループ",
        "Reward group",
        "この報酬が属するログインボーナスグループです。",
        "Login reward group this reward belongs to."
      ),
      acquireActions: jaEnField(
        "獲得アクション",
        "Acquire actions",
        "このログイン段階で実行する報酬アクションです。",
        "Reward actions executed for this login step."
      ),
    })
);

const Schedule = defineOverlayDomainType("Schedule", schedule.overlay("Schedule"));

const BonusModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.loginReward.BonusModel)
    .mountLocal(LoginRewardCollection)
    .bindings({
      mode: Bind.domainProperty(Source.direct(LoginRewardCollection, "mode")),
      repeat: Bind.domainProperty(Source.direct(LoginRewardCollection, "repeat")),
      missedReceiveRelief: Bind.domainProperty(
        Source.direct(LoginRewardCollection, "missedReceiveRelief")
      ),
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
    .addArrayChild("missedReceiveReliefConsumeActions", consumeAction => {
      consumeAction
        .model(GS2.transaction.ConsumeAction)
        .mountLocal(LoginRewardCollection)
        .bindings({
          action: Bind.domainProperty(
            Source.parent(Source.direct(LoginRewardCollection, "missedReceiveReliefConsumeActions"))
          ),
        });
    })
);

const ReceiveStatus = defineUserDataResource(resource =>
  resource
    .model(GS2.loginReward.ReceiveStatus)
    .mountLocal(LoginRewardCollection)
    .linkedMasterResourceId(BonusModel)
    .bindings({
      bonusModelName: Bind.domainProperty(Source.direct(LoginRewardCollection, "id")),
      receiveStatusId: Bind.skip(),
      lastReceivedAt: Bind.domainProperty(Source.direct(LoginRewardCollection, "lastReceivedAt")),
      receivedSteps: Bind.domainProperties([Source.direct(LoginRewardCollection, "receivedSteps")]),
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
        transactionSetting: transactionSetting({
          enableAtomicCommit: Bind.static(true),
          enableAutoRun: Bind.static(true),
        }),
      })
      .addChild(BonusModel)
  )
  .userDataResource(ReceiveStatus)

  .delegatedAction(LoginRewardCollection, "Receive", {
    targetActionKey: "Gs2LoginReward:ReceiveStatus.Receive",
    targetResource: ReceiveStatus,
  })
  .delegatedAction(LoginRewardCollection, "MissedReceive", {
    targetActionKey: "Gs2LoginReward:ReceiveStatus.MissedReceive",
    targetResource: ReceiveStatus,
  })
  // Deleting the status starts the player over from the first step. The group
  // arrives as a reference so each group's own status is the one removed.
  .actionTransform("ResetReceiveStatus", at =>
    at
      .category("acquire")
      .parameter("loginRewardCollection", { type: PT.ref("LoginRewardCollection") })
      .output("Gs2LoginReward:DeleteReceiveStatusByUserId", o =>
        o
          .resourceRef(() => BonusModel)
          .mapResourceKey("namespaceName")
          .mapParameter("bonusModelName", "loginRewardCollection")
          .mapPlaceholder("userId", "#{userId}")
      )
  )
  .build();
