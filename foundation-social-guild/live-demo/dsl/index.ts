import { definePackage, dependencyPackage } from "~/dsl";

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

/** Deny guild actions explicitly for ordinary members so the policy does not depend on empty-policy semantics. */
const MEMBER_POLICY = JSON.stringify({
  Version: "2016-04-01",
  Statements: [{ Effect: "Deny", Actions: ["*"], Resources: ["*"] }],
});

export const foundationSocialGuildDemo = definePackage("foundation-social-guild-demo", "0.0.0")
  .display({
    label: { ja: "ギルド（デモデータ）", en: "Guilds (demo data)" },
    description: {
      ja: "ライブデモ用に、ギルドの種別 1 つと、マスター・一般メンバーの 2 つの役職を提供します。",
      en: "Supplies the live demo's one guild kind and its two roles, master and member.",
    },
  })
  .dependency(guild.packageId, "github:gs2io/gs2-studio-package")

  .instance(GuildRole, "master", {
    [guild.propertyId("GuildRole", "policyDocument")]: MASTER_POLICY,
  })
  .instance(GuildRole, "member", {
    [guild.propertyId("GuildRole", "policyDocument")]: MEMBER_POLICY,
  })

  // Allow immediate rejoining for repeated demos; leave master count uncapped because handover promotes the successor before the current master leaves.
  .instance(Guild, GUILD_KIND, {
    [guild.propertyId("Guild", "defaultMaximumMemberCount")]: STARTING_CAPACITY,
    [guild.propertyId("Guild", "maximumMemberCount")]: MAXIMUM_CAPACITY,
    [guild.propertyId("Guild", "inactivityPeriodDays")]: 7,
    [guild.propertyId("Guild", "rejoinCoolTimeMinutes")]: 0,
    [guild.propertyId("Guild", "maxConcurrentJoinGuilds")]: 1,
    [guild.propertyId("Guild", "guildMasterRole")]: "master",
    [guild.propertyId("Guild", "guildMemberDefaultRole")]: "member",
  })

  // Membership exposes the guild id, so leave name lookup to the lobby panel instead of presenting the id as its name.
  .uiComponent(Guild, ui =>
    ui
      .templateLabel(
        "MembershipLabel",
        "You are a member. The lobby above shows which guild.",
        {},
        { name: "Guild" }
      )
      .templateLabel(
        "CapacityLabel",
        "Room for {defaultMaximumMemberCount}, up to {maximumMemberCount}",
        {
          defaultMaximumMemberCount: ui.inheritedProp(
            guild.propertyId("Guild", "defaultMaximumMemberCount")
          ),
          maximumMemberCount: ui.inheritedProp(guild.propertyId("Guild", "maximumMemberCount")),
        },
        { name: "Guild" }
      )
  )
  .build();
