/**
 * Live demo content for `foundation-social-graph`.
 *
 * Players find each other by id: a visitor copies their own id to another
 * player, looks that player up by theirs, sends a friend request, and follows
 * them. The other player accepts or declines; either side can cancel, remove
 * or unfollow.
 *
 * The feature package is the profile, the friend and follow lists, and the
 * friend requests each way. It needs no demo data: GS2 creates a player's
 * profile when it is first read. This package only says what each of those
 * shows on the page.
 *
 * **The lists are generated rows.** Friends and follows carry the other
 * player's profiles, read with the list. A friend request carries only the
 * other player's id, so the name on a request row is hand-written: it reads
 * that player's public profile.
 *
 * **Everything else is the page's.** Showing and copying one's own id,
 * looking a player up, sending a request, following and editing the profile
 * are not actions a package can host, so they are a hand-written Unity panel,
 * and the buttons on each row are hand-written too.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import graphSurface from "../../dsl/dependency-surface.json";

const graph = dependencyPackage(graphSurface);

const Profile = graph.type("Profile");
const Friend = graph.type("Friend");
const Follow = graph.type("Follow");
const SendFriendRequest = graph.type("SendFriendRequest");
const ReceiveFriendRequest = graph.type("ReceiveFriendRequest");

export const foundationSocialGraphDemo = definePackage("foundation-social-graph-demo", "0.0.0")
  .display({
    label: { ja: "フレンド・プロフィール（デモ表示）", en: "Friends & Profile (demo display)" },
    description: {
      ja: "ライブデモ用に、プロフィール・フレンド・フォロー・フレンド申請の表示項目を提供します。",
      en: "Supplies what the live demo shows of a profile, a friend, a follow and a friend request.",
    },
  })
  .dependency(graph.packageId, "github:gs2io/gs2-studio-package")

  // The feature package ships no components: what a title shows of a player
  // is the title's decision.
  .uiComponent(Profile, ui =>
    ui
      .templateLabel(
        "NameLabel",
        "{publicProfile}",
        { publicProfile: ui.inheritedProp(graph.propertyId("Profile", "publicProfile")) },
        { name: "Profile" }
      )
      .templateLabel(
        "FriendProfileLabel",
        "{friendProfile}",
        { friendProfile: ui.inheritedProp(graph.propertyId("Profile", "friendProfile")) },
        { name: "Profile" }
      )
      .templateLabel(
        "FollowerProfileLabel",
        "{followerProfile}",
        { followerProfile: ui.inheritedProp(graph.propertyId("Profile", "followerProfile")) },
        { name: "Profile" }
      )
  )
  .uiComponent(Friend, ui =>
    ui
      .templateLabel(
        "NameLabel",
        "{publicProfile}",
        { publicProfile: ui.inheritedProp(graph.propertyId("Friend", "publicProfile")) },
        { name: "Friend" }
      )
      .templateLabel(
        "FriendProfileLabel",
        "{friendProfile}",
        { friendProfile: ui.inheritedProp(graph.propertyId("Friend", "friendProfile")) },
        { name: "Friend" }
      )
  )
  .uiComponent(Follow, ui =>
    ui
      .templateLabel(
        "NameLabel",
        "{publicProfile}",
        { publicProfile: ui.inheritedProp(graph.propertyId("Follow", "publicProfile")) },
        { name: "Follow" }
      )
      .templateLabel(
        "FollowerProfileLabel",
        "{followerProfile}",
        { followerProfile: ui.inheritedProp(graph.propertyId("Follow", "followerProfile")) },
        { name: "Follow" }
      )
  )
  // A request is named by the other player's id and nothing else.
  .uiComponent(ReceiveFriendRequest, ui =>
    ui.templateLabel("IdLabel", "{id}", { id: ui.prop("id") }, { name: "ReceiveFriendRequest" })
  )
  .uiComponent(SendFriendRequest, ui =>
    ui.templateLabel("IdLabel", "{id}", { id: ui.prop("id") }, { name: "SendFriendRequest" })
  )
  .build();
