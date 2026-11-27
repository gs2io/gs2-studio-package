import {
  definePackage,
  defineUiComponent,
  dependencyPackage,
  UiItem,
  UiSource,
} from "gs2-studio-dsl";

import { liveDemoDependencies } from "../../../dsl/liveDemoDependencies";

import identitySurface from "../../dsl/dependency-surface.json";

const identity = dependencyPackage(identitySurface);

const TransferCode = identity.type("TransferCode");

export const foundationCoreIdentityDemo = definePackage({
  id: "foundation-core-identity-demo",
  version: "0.0.1",
  display: {
    ja: {
      label: "引き継ぎ設定（デモデータ）",
      description: "ライブデモ用に、引き継ぎコードの表示項目を提供します。",
    },
    en: {
      label: "Account Transfer (demo data)",
      description: "Supplies what the live demo shows of a transfer code.",
    },
  },
  dependencies: liveDemoDependencies(identity.packageId),
  uiComponents: [
    defineUiComponent(TransferCode, {
  items: [
    UiItem.templateLabel("IdentifierLabel", "{userIdentifier}", { userIdentifier: UiSource.inheritedProp(identity.propertyId("TransferCode", "userIdentifier")) }, { name: "TransferCode", fallbackText: "None issued yet" }),
  ],
}),
  ],
});
