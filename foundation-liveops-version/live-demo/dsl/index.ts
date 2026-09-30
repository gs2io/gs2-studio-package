/**
 * Live demo content for `foundation-liveops-version`.
 *
 * A version check asks two kinds of question at once. Has the player agreed to
 * the terms, and to which version? And is the app, and are its assets, recent
 * enough? The first is answered by what the player accepted; the second by
 * the versions the client reports. The check passes only when neither answer
 * is an error, and then GS2 hands back a project token.
 *
 * The feature package is the gate and the two kinds of version. This package
 * adds the versions a visitor can play against:
 *
 * - terms, required, at 2.0.0: accepting 1.0.0 still warns, and accepting
 *   nothing fails.
 * - marketing, optional: it can be rejected instead, but an unanswered one
 *   fails the check all the same.
 * - app and asset, reported by the client: the page lets a visitor pick the
 *   version the client claims, below, at or above each warning.
 *
 * **Everything a visitor presses is the page's.** Accepting, rejecting and
 * checking are not actions a package can host, so they are a hand-written
 * Unity panel.
 *
 * **Passing signs the visitor in as someone else.** GS2 hands a player who
 * passes the project token of the gate's `assumeUserId`. This demo names a user
 * with no policy at all, created in its own client stack, so the token carries
 * no permission.
 */

import { definePackage, dependencyPackage } from "~/dsl";

import versionSurface from "../../dsl/dependency-surface.json";

const version = dependencyPackage(versionSurface);

const VersionGate = version.type("VersionGate");
const AgreementVersion = version.type("AgreementVersion");
const EmbeddedVersion = version.type("EmbeddedVersion");

/**
 * The user a player who passes is signed in as. It is created, with no
 * policy, by this demo's client stack (`live-demo/client-stack.yaml`).
 */
const PASSED_USER = "grn:gs2::{ownerId}:identifier:user:demo-version-passed";

type Triple = readonly [number, number, number];

/** The terms version a player must accept, and the accepted versions that only warn. */
const TERMS_CURRENT: Triple = [2, 0, 0];
const TERMS_WARNING: Triple = [1, 0, 0];
/** The reported app versions that warn, and those that are refused. */
const APP_WARNING: Triple = [1, 1, 0];
const APP_ERROR: Triple = [1, 0, 0];
/** The reported asset versions that warn, and those that are refused. */
const ASSET_WARNING: Triple = [2, 0, 0];
const ASSET_ERROR: Triple = [1, 0, 0];

/** `[2, 0, 0]` -> `2.0.0`, for the rule a visitor reads. */
function dotted(value: Triple): string {
  return value.join(".");
}

/** Authors a version triple into an agreement's `<prefix>Major/Minor/Micro` properties. */
function agreementVersion(prefix: "current" | "warning" | "error", value: Triple) {
  return {
    [version.propertyId("AgreementVersion", `${prefix}Major` as const)]: value[0],
    [version.propertyId("AgreementVersion", `${prefix}Minor` as const)]: value[1],
    [version.propertyId("AgreementVersion", `${prefix}Micro` as const)]: value[2],
  };
}

/** Authors a version triple into a reported version's `<prefix>Major/Minor/Micro` properties. */
function reportedVersion(prefix: "warning" | "error", value: Triple) {
  return {
    [version.propertyId("EmbeddedVersion", `${prefix}Major` as const)]: value[0],
    [version.propertyId("EmbeddedVersion", `${prefix}Minor` as const)]: value[1],
    [version.propertyId("EmbeddedVersion", `${prefix}Micro` as const)]: value[2],
  };
}

export const foundationLiveopsVersionDemo = definePackage(
  "foundation-liveops-version-demo",
  "0.0.0"
)
  .display({
    label: { ja: "バージョン管理（デモデータ）", en: "Version Gate (demo data)" },
    description: {
      ja: "ライブデモ用に、必須と任意の利用規約、アプリとアセットの申告バージョン、確認を通過したときのユーザーを提供します。",
      en: "Supplies the live demo's required and optional agreements, the app and asset versions the client reports, and the user a player who passes is signed in as.",
    },
  })
  .dependency(version.packageId, "github:gs2io/gs2-studio-package")

  // A single-entry type's row is named after the type.
  .instance(VersionGate, "versiongate", {
    [version.propertyId("VersionGate", "assumeUserId")]: PASSED_USER,
  })

  .instance(AgreementVersion, "terms", {
    [version.propertyId("AgreementVersion", "required")]: "required",
    ...agreementVersion("current", TERMS_CURRENT),
    ...agreementVersion("warning", TERMS_WARNING),
    ...agreementVersion("error", [0, 0, 0]),
  })
  .instance(AgreementVersion, "marketing", {
    [version.propertyId("AgreementVersion", "required")]: "optional",
    ...agreementVersion("current", [1, 0, 0]),
    ...agreementVersion("warning", [0, 0, 0]),
    ...agreementVersion("error", [0, 0, 0]),
  })

  .instance(EmbeddedVersion, "app", {
    ...reportedVersion("warning", APP_WARNING),
    ...reportedVersion("error", APP_ERROR),
  })
  .instance(EmbeddedVersion, "asset", {
    ...reportedVersion("warning", ASSET_WARNING),
    ...reportedVersion("error", ASSET_ERROR),
  })

  // The feature package ships no components: what a title shows of its gate
  // is the title's decision. The rule hangs from the agreements, because the
  // gate itself has nothing a client can load; the page shows it on the terms
  // row, beside the hand-written panel.
  .uiComponent(AgreementVersion, ui =>
    ui.templateLabel(
      "RuleLabel",
      `You pass when nothing is an error. Accept the terms at ${dotted(TERMS_CURRENT)} (${dotted(TERMS_WARNING)} only warns), and answer marketing either way. The app is refused at ${dotted(APP_ERROR)} and below and warned up to ${dotted(APP_WARNING)}; the assets likewise at ${dotted(ASSET_ERROR)} and ${dotted(ASSET_WARNING)}.`,
      {},
      { name: "AgreementVersion" }
    )
  )
  .build();
