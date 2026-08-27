import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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
  .displayType(Guild, { label: { ja: "ギルド種別", en: "Guild kind" } })
  .displayType(GuildRole, { label: { ja: "ギルド権限", en: "Guild role" } })
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
