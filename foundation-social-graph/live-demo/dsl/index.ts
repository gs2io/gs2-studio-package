import {
  definePackage,
  defineUiComponent,
  dependencyPackage,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import graphSurface from "../../dsl/dependency-surface.json";

const graph = dependencyPackage(graphSurface);

const Profile = graph.type("Profile");

const Friend = graph.type("Friend");

const Follow = graph.type("Follow");

const SendFriendRequest = graph.type("SendFriendRequest");

const ReceiveFriendRequest = graph.type("ReceiveFriendRequest");

export const foundationSocialGraphDemo = definePackage({
  id: "foundation-social-graph-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "フレンド・プロフィール（デモデータ）",
      description:
        "ライブデモ用に、プロフィール・フレンド・フォロー・フレンド申請の表示項目を提供します。",
    },
    en: {
      label: "Friends & Profile (demo data)",
      description:
        "Supplies what the live demo shows of a profile, a friend, a follow and a friend request.",
    },
  },
  dependencies: liveDemoDependencies(graph.packageId),
  uiComponents: [
    defineUiComponent(Profile, {
  items: [
    UiItem.templateLabel("NameLabel", "{publicProfile}", { publicProfile: UiSource.inheritedProp(graph.propertyId("Profile", "publicProfile")) }, { name: "Profile" }),
    UiItem.templateLabel("FriendProfileLabel", "{friendProfile}", { friendProfile: UiSource.inheritedProp(graph.propertyId("Profile", "friendProfile")) }, { name: "Profile" }),
    UiItem.templateLabel("FollowerProfileLabel", "{followerProfile}", { followerProfile: UiSource.inheritedProp(graph.propertyId("Profile", "followerProfile")) }, { name: "Profile" }),
  ],
}),
    defineUiComponent(Friend, {
  items: [
    UiItem.templateLabel("NameLabel", "{publicProfile}", { publicProfile: UiSource.inheritedProp(graph.propertyId("Friend", "publicProfile")) }, { name: "Friend" }),
    UiItem.templateLabel("FriendProfileLabel", "{friendProfile}", { friendProfile: UiSource.inheritedProp(graph.propertyId("Friend", "friendProfile")) }, { name: "Friend" }),
  ],
}),
    defineUiComponent(Follow, {
  items: [
    UiItem.templateLabel("NameLabel", "{publicProfile}", { publicProfile: UiSource.inheritedProp(graph.propertyId("Follow", "publicProfile")) }, { name: "Follow" }),
    UiItem.templateLabel("FollowerProfileLabel", "{followerProfile}", { followerProfile: UiSource.inheritedProp(graph.propertyId("Follow", "followerProfile")) }, { name: "Follow" }),
  ],
}),
    defineUiComponent(ReceiveFriendRequest, {
  items: [
    UiItem.templateLabel("IdLabel", "{id}", { id: UiSource.prop("id") }, { name: "ReceiveFriendRequest" }),
  ],
}),
    defineUiComponent(SendFriendRequest, {
  items: [
    UiItem.templateLabel("IdLabel", "{id}", { id: UiSource.prop("id") }, { name: "SendFriendRequest" }),
  ],
}),
  ],
});
