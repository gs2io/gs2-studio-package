import {
  definePackage,
  defineUiComponent,
  dependencyPackage,
  instance,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import guildSurface from "../../dsl/dependency-surface.json";

const guild = dependencyPackage(guildSurface);

const Guild = guild.type("Guild");

const GuildRole = guild.type("GuildRole");

const GUILD_KIND = "adventurers";

const STARTING_CAPACITY = 5;

const MAXIMUM_CAPACITY = 10;

const MASTER_POLICY = JSON.stringify({
  Version: "2016-04-01",
  Statements: [
    {
      Effect: "Allow",
      Actions: [
        "Gs2Guild:DescribeReceiveRequests",
        "Gs2Guild:AcceptRequest",
        "Gs2Guild:RejectRequest",
        "Gs2Guild:UpdateMemberRole",
        "Gs2Guild:DeleteGuild",
      ],
      Resources: ["*"],
    },
  ],
});

const MEMBER_POLICY = JSON.stringify({
  Version: "2016-04-01",
  Statements: [{ Effect: "Deny", Actions: ["*"], Resources: ["*"] }],
});

export const foundationSocialGuildDemo = definePackage({
  id: "foundation-social-guild-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "ギルド（デモデータ）",
      description:
        "ライブデモ用に、ギルドの種別 1 つと、マスター・一般メンバーの 2 つの役職を提供します。",
    },
    en: {
      label: "Guilds (demo data)",
      description: "Supplies the live demo's one guild kind and its two roles, master and member.",
    },
  },
  dependencies: {
    [guild.packageId]: "github:gs2io/gs2-studio-package",
  },
  instances: [
    instance(GuildRole, "master", {
    [guild.propertyId("GuildRole", "policyDocument")]: MASTER_POLICY,
  }),
    instance(GuildRole, "member", {
    [guild.propertyId("GuildRole", "policyDocument")]: MEMBER_POLICY,
  }),
    instance(Guild, GUILD_KIND, {
    [guild.propertyId("Guild", "defaultMaximumMemberCount")]: STARTING_CAPACITY,
    [guild.propertyId("Guild", "maximumMemberCount")]: MAXIMUM_CAPACITY,
    [guild.propertyId("Guild", "inactivityPeriodDays")]: 7,
    [guild.propertyId("Guild", "rejoinCoolTimeMinutes")]: 0,
    [guild.propertyId("Guild", "maxConcurrentJoinGuilds")]: 1,
    [guild.propertyId("Guild", "guildMasterRole")]: "master",
    [guild.propertyId("Guild", "guildMemberDefaultRole")]: "member",
  }),
  ],
  uiComponents: [
    defineUiComponent(Guild, {
  items: [
    UiItem.templateLabel("MembershipLabel", "You are a member. The lobby above shows which guild.", {}, { name: "Guild" }),
    UiItem.templateLabel("CapacityLabel", "Room for {defaultMaximumMemberCount}, up to {maximumMemberCount}", {
          defaultMaximumMemberCount: UiSource.inheritedProp(guild.propertyId("Guild", "defaultMaximumMemberCount")),
          maximumMemberCount: UiSource.inheritedProp(guild.propertyId("Guild", "maximumMemberCount")),
        }, { name: "Guild" }),
  ],
}),
  ],
});
