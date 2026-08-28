import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

/**
 * What a member of a guild is allowed to do. Roles are defined per guild type;
 * the policy document is the GS2 permission grammar, so it is authored as text
 * rather than modelled here.
 */
const GuildRole = defineDomainType("GuildRole", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.string("policyDocument").masterData().required().description("GS2 guild policy document")
    )
    .localizedProperties({
      id: jaEnId("ギルド権限", "guild role"),
      policyDocument: jaEnField(
        "権限ポリシー",
        "Permission policy",
        "このロールに許可する操作を記述したGS2ポリシーです。",
        "GS2 policy document describing operations allowed for this role."
      ),
    })
);

/**
 * A kind of guild — its size limits and its roles. A project usually ships one
 * of these; the guilds players actually create are runtime data, and what this
 * package tracks per player is which one they joined.
 */
const Guild = defineDomainType("Guild", dt =>
  dt
    .idDescription("Unique identifier")
    .property(
      PT.int32("defaultMaximumMemberCount")
        .masterData()
        .required()
        .description("Member capacity a newly created guild starts with")
    )
    .property(
      PT.int32("maximumMemberCount")
        .masterData()
        .required()
        .description("Highest capacity a guild can be raised to")
    )
    .property(
      PT.int32("inactivityPeriodDays")
        .masterData()
        .description("Days of guild-master inactivity before the seat opens up")
    )
    .property(
      PT.int32("rejoinCoolTimeMinutes")
        .masterData()
        .description("Wait before a player may rejoin a guild they left")
    )
    .property(PT.int32("maxConcurrentJoinGuilds").masterData())
    .property(PT.int32("maxConcurrentGuildMasterCount").masterData())
    .property(PT.prop("guildMasterRole", PT.ref("GuildRole")).assetDelivery().required())
    .property(PT.prop("guildMemberDefaultRole", PT.ref("GuildRole")).assetDelivery().required())
    .property(
      PT.string("joinedGuildName").userData().description("The guild this player belongs to")
    )
    .localizedProperties({
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
        "ギルドマスター交代を可能にする無活動期間です。",
        "Inactivity period after which the guild master position can be reassigned.",
        { ja: "日", en: "days" }
      ),
      rejoinCoolTimeMinutes: jaEnField(
        "再参加待機時間",
        "Rejoin cooldown",
        "脱退後に同じギルドへ再参加できるまでの待機時間です。",
        "Wait time before a player may rejoin a guild they left.",
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
        "プレイヤーが同時にマスターを務められるギルド数です。",
        "Maximum number of guilds a player may lead at once.",
        { ja: "件", en: "guilds" }
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
    })
);

const GuildModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.guild.GuildModel)
    .mountLocal(Guild)
    .bindings({
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
    })
    .addArrayChild("roles", role => {
      role
        .model(GS2.guild.RoleModel)
        .mountLocal(GuildRole)
        .bindings({
          name: Bind.domainProperty(Source.direct(GuildRole, "id")),
          metadata: Bind.static(""),
          policyDocument: Bind.domainProperty(Source.direct(GuildRole, "policyDocument")),
        });
    })
);

export const foundationSocialGuild = definePackage("foundation-social-guild", "0.0.0")
  .display({
    label: { ja: "ギルド", en: "Guilds" },
    description: {
      ja: "プレイヤーが集まるギルドを扱います。定員・権限ロール・所属状況を管理します。",
      en: "Handles player guilds — capacity, permission roles, and which guild a player belongs to.",
    },
  })
  .displayType(Guild, {
    label: { ja: "ギルド種別", en: "Guild kind" },
    description: {
      ja: "ギルドの参加方式、定員、カスタム項目などの基本設定を定義します。",
      en: "Defines a guild kind's join policy, capacity, and custom properties.",
    },
  })
  .displayType(GuildRole, {
    label: { ja: "ギルド権限", en: "Guild role" },
    description: {
      ja: "ギルドメンバーに割り当てる役職と操作権限を設定します。",
      en: "Configures guild member roles and their permissions.",
    },
  })
  .domainType(Guild)
  .domainType(GuildRole)

  .masterDataResource(r =>
    r
      .model(GS2.guild.Namespace)
      .bindings({
        name: Bind.static("Guild"),
        changeNotification: Bind.null(),
        joinNotification: Bind.null(),
        leaveNotification: Bind.null(),
        changeMemberNotification: Bind.null(),
        changeMemberNotificationIgnoreChangeMetadata: Bind.static(false),
        receiveRequestNotification: Bind.null(),
        removeRequestNotification: Bind.null(),
        createGuildScript: Bind.null(),
        updateGuildScript: Bind.null(),
        joinGuildScript: Bind.null(),
        receiveJoinRequestScript: Bind.null(),
        leaveGuildScript: Bind.null(),
        changeRoleScript: Bind.null(),
        deleteGuildScript: Bind.null(),
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
      .addChild(GuildModel)
  )

  .userDataResource(r =>
    r
      .model(GS2.guild.JoinedGuild)
      .mountLocal(Guild)
      .linkedMasterResourceId(GuildModel)
      .bindings({
        guildName: Bind.domainProperty(Source.direct(Guild, "joinedGuildName")),
        joinedGuildId: Bind.skip(),
        guildModelName: Bind.skip(),
        userId: Bind.skip(),
        createdAt: Bind.skip(),
      })
  )

  .actionTransform("IncreaseGuildCapacity", at =>
    at
      .category("acquire")
      .parameter("guild", { type: PT.ref("Guild") })
      .parameter("guildName", { type: PT.string() })
      .parameter("value", { type: PT.int32() })
      .output("Gs2Guild:IncreaseMaximumCurrentMaximumMemberCountByGuildName", o =>
        o
          .resourceRef(() => GuildModel)
          .mapResourceKey("namespaceName")
          .mapParameter("guildModelName", "guild")
          .mapParameter("guildName", "guildName")
          .mapParameter("value", "value")
      )
  )
  .actionTransform("VerifyGuildMembership", at =>
    at
      .category("verify")
      .parameter("guild", { type: PT.ref("Guild") })
      .parameter("guildName", { type: PT.string() })
      .output("Gs2Guild:VerifyIncludeMemberByUserId", o =>
        o
          .resourceRef(() => GuildModel)
          .mapResourceKey("namespaceName")
          .mapParameter("guildModelName", "guild")
          .mapParameter("guildName", "guildName")
          .mapPlaceholder("userId", "#{userId}")
          .mapStatic("verifyType", "include")
      )
  )
  .build();
