/**
 * Live demo content for `foundation-social-guild`.
 *
 * Guilds every visitor shares. A visitor names and founds a guild, or finds one
 * another visitor founded and joins it, straight away or by asking the guild
 * master; the master accepts or declines, hands the guild over, or disbands
 * it.
 *
 * The feature package is the guild kind and a player's membership. This
 * package adds the one kind, its capacity, and the two roles a member can
 * have: a master, who may act as the guild to accept requests, hand over and
 * disband, and a member, who may do nothing as the guild.
 *
 * **The guilds a visitor belongs to are generated rows.** They are the
 * membership the feature package tracks, and they change as the visitor
 * founds, joins, leaves or is accepted.
 *
 * **Everything else is the page's.** Founding, searching, joining, answering
 * requests and acting as the guild are not actions a package can host, so they
 * are a hand-written Unity panel.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import guildSurface from "../../dsl/dependency-surface.json";

const guild = dependencyPackage(guildSurface);

const Guild = guild.type("Guild");
const GuildRole = guild.type("GuildRole");

/** The one guild kind, as the page and GS2 name it. */
const GUILD_KIND = "adventurers";

/** A guild starts with room for this many, and can be raised to the maximum. */
const STARTING_CAPACITY = 5;
const MAXIMUM_CAPACITY = 10;

/**
 * What a master may do as the guild: answer join requests, hand the guild
 * over, and disband it.
 */
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

/**
 * A member may do nothing as the guild. This denies everything outright
 * rather than being left empty: some GS2 versions treat an empty policy as
 * allowing everything.
 */
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

  // One guild each, so joining another means leaving first. No wait before
  // joining again, so a visitor can try every path in one sitting. The number
  // of masters is left open: handing the guild over promotes the new master
  // before the old one leaves.
  .instance(Guild, GUILD_KIND, {
    [guild.propertyId("Guild", "defaultMaximumMemberCount")]: STARTING_CAPACITY,
    [guild.propertyId("Guild", "maximumMemberCount")]: MAXIMUM_CAPACITY,
    [guild.propertyId("Guild", "inactivityPeriodDays")]: 7,
    [guild.propertyId("Guild", "rejoinCoolTimeMinutes")]: 0,
    [guild.propertyId("Guild", "maxConcurrentJoinGuilds")]: 1,
    [guild.propertyId("Guild", "guildMasterRole")]: "master",
    [guild.propertyId("Guild", "guildMemberDefaultRole")]: "member",
  })

  // The feature package ships no components: what a title shows of a guild is
  // the title's decision.
  // A membership carries only the id GS2 gave the guild, not the name its
  // founder typed. The id means nothing to a visitor, so the row says that the
  // membership exists and leaves the name to the lobby panel above.
  .uiComponent(Guild, ui =>
    ui
      .templateLabel(
        "MembershipLabel",
        "Member. The lobby above shows the guild.",
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
