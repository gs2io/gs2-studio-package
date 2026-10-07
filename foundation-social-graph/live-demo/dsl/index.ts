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
    label: { ja: "フレンド・プロフィール（デモデータ）", en: "Friends & Profile (demo data)" },
    description: {
      ja: "ライブデモ用に、プロフィール・フレンド・フォロー・フレンド申請の表示項目を提供します。",
      en: "Supplies what the live demo shows of a profile, a friend, a follow and a friend request.",
    },
  })
  .dependency(graph.packageId, "github:gs2io/gs2-studio-package")

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
  .uiComponent(ReceiveFriendRequest, ui =>
    ui.templateLabel("IdLabel", "{id}", { id: ui.prop("id") }, { name: "ReceiveFriendRequest" })
  )
  .uiComponent(SendFriendRequest, ui =>
    ui.templateLabel("IdLabel", "{id}", { id: ui.prop("id") }, { name: "SendFriendRequest" })
  )
  .build();
