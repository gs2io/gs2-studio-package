/** The page owns credential entry and takeover before login; this package supplies the transfer-slot read view. */

import { definePackage, dependencyPackage } from "~/dsl";

import identitySurface from "../../dsl/dependency-surface.json";

const identity = dependencyPackage(identitySurface);

const TransferCode = identity.type("TransferCode");

export const foundationCoreIdentityDemo = definePackage("foundation-core-identity-demo", "0.0.0")
  .display({
    label: { ja: "引き継ぎ設定（デモデータ）", en: "Account Transfer (demo data)" },
    description: {
      ja: "ライブデモ用に、引き継ぎコードの表示項目を提供します。",
      en: "Supplies what the live demo shows of a transfer code.",
    },
  })
  .dependency(identity.packageId, "github:gs2io/gs2-studio-package")

  .uiComponent(TransferCode, ui =>
    ui.templateLabel(
      "IdentifierLabel",
      "{userIdentifier}",
      { userIdentifier: ui.inheritedProp(identity.propertyId("TransferCode", "userIdentifier")) },
      { name: "TransferCode", fallbackText: "None issued yet" }
    )
  )
  .build();
