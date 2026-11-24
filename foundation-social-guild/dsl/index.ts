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

const GuildRole = defineDomainType("GuildRole", {
  properties: {
    policyDocument: PT.string().masterData().required(),
  },
  localizedDisplay: {
    ja: {
      label: "ギルド権限",
      description: "ギルドメンバーに割り当てる役職と操作権限を設定します。",
    },
    en: {
      label: "Guild role",
      description: "Configures guild member roles and their permissions.",
    },
  },
  localizedProperties: {
    id: jaEnId("ギルド権限", "guild role"),
    policyDocument: jaEnField(
      "権限ポリシー",
      "Permission policy",
      "このロールのメンバーがギルドとして振る舞うとき（Assume）に許可する操作を記述した GS2 ポリシーです。何も許可しないロールは、空にせず、Effect を Deny、Actions と Resources を * にした文で、すべてを拒否するポリシーを明示してください。空のポリシーは、GS2 の版によっては全許可として扱われます。",
      "GS2 policy document describing what a member with this role may do while acting as the guild (Assume). For a role that may do nothing, do not leave it empty: write a policy that denies everything, with one statement whose Effect is Deny and whose Actions and Resources are *. Some GS2 versions treat an empty policy as allowing everything."
    ),
  },
});

const Guild = defineDomainType("Guild", {
  properties: {
    defaultMaximumMemberCount: PT.int32().masterData().required(),
    maximumMemberCount: PT.int32().masterData().required(),
    inactivityPeriodDays: PT.int32().masterData(),
    rejoinCoolTimeMinutes: PT.int32().masterData(),
    maxConcurrentJoinGuilds: PT.int32().masterData(),
    maxConcurrentGuildMasterCount: PT.int32().masterData(),
    guildMasterRole: PT.ref(GuildRole).assetDelivery().required(),
    guildMemberDefaultRole: PT.ref(GuildRole).assetDelivery().required(),
    joinedGuildName: PT.string().userData(),
  },
  localizedDisplay: {
    ja: {
      label: "ギルド種別",
      description:
        "ギルドの種類ごとに、定員・マスターの交代・再参加の待機・権限ロールを設定します。1 行は、プレイヤーが所属しているその種類のギルドを表します。",
    },
    en: {
      label: "Guild kind",
      description:
        "Configures a guild kind's capacity, master succession, rejoin wait and roles. A row is a guild of that kind the player belongs to.",
    },
  },
  localizedProperties: {
      id: jaEnId("ギルド種別", "guild kind"),
      defaultMaximumMemberCount: jaEnField(
        "初期定員",
        "Initial member capacity",
        "新規作成したギルドに適用する初期定員です。",
        "Initial member capacity of a newly created guild.",
        { ja: "人", en: "members" }
      ),
      maximumMemberCount: jaEnField(
        "最大定員",
        "Maximum member capacity",
        "ギルドが拡張できる定員の最大値です。",
        "Highest member capacity a guild can reach.",
        { ja: "人", en: "members" }
      ),
      inactivityPeriodDays: jaEnField(
        "マスター不在判定期間",
        "Master inactivity period",
        "ギルドマスターの無活動がこの日数続くと、最古参のメンバーがマスターに昇格できる（PromoteSeniorMember）ようになります。",
        "Days of guild master inactivity after which the most senior member may promote themselves to master (PromoteSeniorMember).",
        { ja: "日", en: "days" }
      ),
      rejoinCoolTimeMinutes: jaEnField(
        "再参加待機時間",
        "Rejoin cooldown",
        "脱退した後、どのギルドにも参加できるようになるまでの待機時間です。",
        "Wait time after leaving before a player may join any guild again.",
        { ja: "分", en: "minutes" }
      ),
      maxConcurrentJoinGuilds: jaEnField(
        "同時所属上限",
        "Concurrent guild limit",
        "プレイヤーが同時に所属できるギルド数です。",
        "Maximum number of guilds a player may join at once.",
        { ja: "件", en: "guilds" }
      ),
      maxConcurrentGuildMasterCount: jaEnField(
        "同時マスター上限",
        "Concurrent master limit",
        "1 つのギルドに同時に置けるギルドマスターの人数です。",
        "Maximum number of guild masters one guild may have at once.",
        { ja: "人", en: "masters" }
      ),
      guildMasterRole: jaEnField(
        "マスターロール",
        "Guild master role",
        "ギルドマスターに割り当てる権限ロールです。",
        "Permission role assigned to the guild master."
      ),
      guildMemberDefaultRole: jaEnField(
        "一般メンバーロール",
        "Default member role",
        "一般メンバーに初期割り当てする権限ロールです。",
        "Permission role initially assigned to regular members."
      ),
      joinedGuildName: jaEnField(
        "所属ギルド名",
        "Joined guild name",
        "プレイヤーが現在所属しているギルド名です。",
        "Name of the guild the player currently belongs to."
      ),
    },
});

const GuildModel = defineMasterDataResource({
  model: GS2.guild.GuildModel,
  mount: Guild,
  bindings: {
      name: Bind.domainProperty(Source.direct(Guild, "id")),
      metadata: Bind.static(""),
      defaultMaximumMemberCount: Bind.domainProperty(
        Source.direct(Guild, "defaultMaximumMemberCount")
      ),
      maximumMemberCount: Bind.domainProperty(Source.direct(Guild, "maximumMemberCount")),
      inactivityPeriodDays: Bind.domainProperty(Source.direct(Guild, "inactivityPeriodDays")),
      rejoinCoolTimeMinutes: Bind.domainProperty(Source.direct(Guild, "rejoinCoolTimeMinutes")),
      maxConcurrentJoinGuilds: Bind.domainProperty(Source.direct(Guild, "maxConcurrentJoinGuilds")),
      maxConcurrentGuildMasterCount: Bind.domainProperty(
        Source.direct(Guild, "maxConcurrentGuildMasterCount")
      ),
      guildMasterRole: Bind.domainProperty(Source.direct(Guild, "guildMasterRole")),
      guildMemberDefaultRole: Bind.domainProperty(Source.direct(Guild, "guildMemberDefaultRole")),
    },
  arrayChildren: {
    roles: [
      defineMasterDataResource({
  model: GS2.guild.RoleModel,
  mount: GuildRole,
  bindings: {
          name: Bind.domainProperty(Source.direct(GuildRole, "id")),
          metadata: Bind.static(""),
          policyDocument: Bind.domainProperty(Source.direct(GuildRole, "policyDocument")),
        },
  rowScope: { kind: "allRows" },
}),
    ],
  },
});

const notificationConfig = {
  enable: Bind.static("Enabled"),
  enableTransferMobileNotification: Bind.static(false),
  gatewayNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:gateway:default"),
  sound: Bind.static(""),
};

const IncreaseGuildCapacityTransform = defineActionTransform("IncreaseGuildCapacity", {
  category: "acquire",
  parameters: {
    guild: { type: PT.ref(Guild) },
    guildName: { type: PT.string() },
    value: { type: PT.int32() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Guild:IncreaseMaximumCurrentMaximumMemberCountByGuildName",
    resource: () => GuildModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      guildModelName: OutputMap.parameter("guild"),
      guildName: OutputMap.parameter("guildName"),
      value: OutputMap.parameter("value"),
    },
  },
  ],
});

const VerifyGuildMembershipTransform = defineActionTransform("VerifyGuildMembership", {
  category: "verify",
  parameters: {
    guild: { type: PT.ref(Guild) },
    guildName: { type: PT.string() },
  },
  outputs: [
    {
    kind: "direct",
    actionName: "Gs2Guild:VerifyIncludeMemberByUserId",
    resource: () => GuildModel,
    parameterMappings: {
      namespaceName: OutputMap.resourceKey(),
      guildModelName: OutputMap.parameter("guild"),
      guildName: OutputMap.parameter("guildName"),
      userId: OutputMap.placeholder("#{userId}"),
      verifyType: OutputMap.static("include"),
    },
  },
  ],
});

export const foundationSocialGuild = definePackage({
  id: "foundation-social-guild",
  version: "0.0.1",
  display: {
    ja: {
      label: "ギルド",
      description: "プレイヤーが集まるギルドを扱います。定員・権限ロール・所属状況を管理します。",
    },
    en: {
      label: "Guilds",
      description:
        "Handles player guilds: capacity, permission roles, and which guild a player belongs to.",
    },
  },
  domainTypes: [Guild, GuildRole],
  masterDataResources: [
    defineMasterDataResource({
  model: GS2.guild.Namespace,
  bindings: {
        name: Bind.static("Guild"),
        // Notify affected clients so joined-guild and join-request views can refresh after membership changes.
        joinNotification: notificationConfig,
        leaveNotification: notificationConfig,
        receiveRequestNotification: notificationConfig,
        removeRequestNotification: notificationConfig,
        ...Bind.nulls("changeNotification", "changeMemberNotification"),
        changeMemberNotificationIgnoreChangeMetadata: Bind.static(false),
        ...Bind.nulls(
          "createGuildScript",
          "updateGuildScript",
          "joinGuildScript",
          "receiveJoinRequestScript",
          "leaveGuildScript",
          "changeRoleScript",
          "deleteGuildScript",
          "logSetting"
        ),
        transactionSettingV2: transactionSettingV2(),
      },
  children: [
    GuildModel,
  ],
}),
  ],
  userDataResources: [
    defineUserDataResource({
  model: GS2.guild.JoinedGuild,
  mount: Guild,
  linkedMaster: GuildModel,
  bindings: {
        guildName: Bind.domainProperty(Source.direct(Guild, "joinedGuildName")),
        joinedGuildId: Bind.skip(),
        guildModelName: Bind.skip(),
        userId: Bind.skip(),
        createdAt: Bind.skip(),
      },
}),
  ],
  actionTransforms: [IncreaseGuildCapacityTransform, VerifyGuildMembershipTransform],
});
