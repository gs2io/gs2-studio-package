import { definePackage, dependencyPackage } from "~/dsl";

import versionSurface from "../../dsl/dependency-surface.json";

const version = dependencyPackage(versionSurface);

const VersionGate = version.type("VersionGate");
const AgreementVersion = version.type("AgreementVersion");
const EmbeddedVersion = version.type("EmbeddedVersion");

/** Match the user created by this demo client stack; passing the gate must not grant the anonymous visitor an application policy. */
const PASSED_USER = "grn:gs2::{ownerId}:identifier:user:demo-version-passed";

type Triple = readonly [number, number, number];

const TERMS_CURRENT: Triple = [2, 0, 0];
const TERMS_WARNING: Triple = [1, 0, 0];
const APP_WARNING: Triple = [1, 1, 0];
const APP_ERROR: Triple = [1, 0, 0];
const ASSET_WARNING: Triple = [2, 0, 0];
const ASSET_ERROR: Triple = [1, 0, 0];

function dotted(value: Triple): string {
  return value.join(".");
}

function agreementVersion(prefix: "current" | "warning" | "error", value: Triple) {
  return {
    [version.propertyId("AgreementVersion", `${prefix}Major` as const)]: value[0],
    [version.propertyId("AgreementVersion", `${prefix}Minor` as const)]: value[1],
    [version.propertyId("AgreementVersion", `${prefix}Micro` as const)]: value[2],
  };
}

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

  // Match the fixed lowercase identity required for a single-entry type.
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

  // Attach the rule to the loadable agreement row because the gate itself has no loader.
  .uiComponent(AgreementVersion, ui =>
    ui.templateLabel(
      "RuleLabel",
      `You pass when nothing is an error. Accept the terms at ${dotted(TERMS_CURRENT)} (${dotted(TERMS_WARNING)} only warns), and answer marketing either way. The app is refused at ${dotted(APP_ERROR)} and below and warned up to ${dotted(APP_WARNING)}; the assets are refused at ${dotted(ASSET_ERROR)} and below and warned up to ${dotted(ASSET_WARNING)}.`,
      {},
      { name: "AgreementVersion" }
    )
  )
  .build();
