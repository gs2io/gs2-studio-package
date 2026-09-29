/**
 * Live demo content for `foundation-core-identity`.
 *
 * A visitor issues a transfer code (an ID and a password) in one browser and
 * uses it in another: the second browser then signs in as the first one's
 * account. Every showroom demo served from the same site keeps the account in
 * the site's browser storage, so the other demos opened in the second browser
 * show the first browser's data too.
 *
 * The feature package is the take-over namespace and the player's transfer
 * code slot (`TransferCode`, keyed by the take-over type number). The page
 * reads that one slot: the take-over list would also carry the OIDC types.
 * This package only says what the slot shows: the ID registered in it. GS2
 * keeps only a hash of the password, so nothing can show it after issuing.
 *
 * **Everything else is the page's.** Issuing a code, deleting and reissuing
 * it, and taking another browser's account over are not actions a package can
 * host (the ID and password are made by the page, and taking over runs before
 * any session exists), so they are a hand-written Unity panel.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import identitySurface from "../../dsl/dependency-surface.json";

const identity = dependencyPackage(identitySurface);

const TransferCode = identity.type("TransferCode");

export const foundationCoreIdentityDemo = definePackage("foundation-core-identity-demo", "0.0.0")
  .display({
    label: { ja: "引き継ぎ設定（デモ表示）", en: "Account Transfer (demo display)" },
    description: {
      ja: "ライブデモ用に、引き継ぎコードの表示項目を提供します。",
      en: "Supplies what the live demo shows of a transfer code.",
    },
  })
  .dependency(identity.packageId, "github:gs2io/gs2-studio-package")

  // The ID is the one part of a transfer code GS2 can give back.
  .uiComponent(TransferCode, ui =>
    ui.templateLabel(
      "IdentifierLabel",
      "{userIdentifier}",
      { userIdentifier: ui.inheritedProp(identity.propertyId("TransferCode", "userIdentifier")) },
      { name: "TransferCode", fallbackText: "None issued yet" }
    )
  )
  .build();
