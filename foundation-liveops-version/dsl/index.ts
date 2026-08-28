import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const AgreementVersion = defineDomainType("AgreementVersion", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.prop("required", PT.enum("required", "optional")).masterData().required())
    .property(PT.int32("currentMajor").masterData().required())
    .property(PT.int32("currentMinor").masterData().required())
    .property(PT.int32("currentMicro").masterData().required())
    .property(PT.prop("status", PT.enum("accept", "reject")).userData())
    .property(PT.bool("exists").userData().required())
    .property(PT.int32("warningMajor").masterData().required())
    .property(PT.int32("warningMinor").masterData().required())
    .property(PT.int32("warningMicro").masterData().required())
    .property(PT.int32("errorMajor").masterData().required())
    .property(PT.int32("errorMinor").masterData().required())
    .property(PT.int32("errorMicro").masterData().required())
    .property(PT.int32("acceptedMajor").userData().required())
    .property(PT.int32("acceptedMinor").userData().required())
    .property(PT.int32("acceptedMicro").userData().required())
    .localizedProperties({
      id: jaEnId("規約バージョン", "agreement version"),
      required: jaEnField(
        "同意要否",
        "Approval requirement",
        "この規約への同意を必須にするかを設定します。",
        "Whether approval of this agreement is required."
      ),
      currentMajor: jaEnField(
        "公開メジャーバージョン",
        "Current major version",
        "現在公開している規約のメジャーバージョンです。",
        "Major component of the currently published agreement version."
      ),
      currentMinor: jaEnField(
        "公開マイナーバージョン",
        "Current minor version",
        "現在公開している規約のマイナーバージョンです。",
        "Minor component of the currently published agreement version."
      ),
      currentMicro: jaEnField(
        "公開マイクロバージョン",
        "Current micro version",
        "現在公開している規約のマイクロバージョンです。",
        "Micro component of the currently published agreement version."
      ),
      status: jaEnField(
        "同意状態",
        "Approval status",
        "プレイヤーが規約へ同意または拒否した状態です。",
        "Whether the player accepted or rejected the agreement."
      ),
      exists: jaEnField(
        "同意記録あり",
        "Has approval record",
        "プレイヤーの規約同意記録が存在するかを示します。",
        "Whether an agreement approval record exists for the player."
      ),
      warningMajor: jaEnField(
        "警告メジャーバージョン",
        "Warning major version",
        "警告を表示する最小バージョンのメジャー値です。",
        "Major component of the minimum version that triggers a warning."
      ),
      warningMinor: jaEnField(
        "警告マイナーバージョン",
        "Warning minor version",
        "警告を表示する最小バージョンのマイナー値です。",
        "Minor component of the minimum version that triggers a warning."
      ),
      warningMicro: jaEnField(
        "警告マイクロバージョン",
        "Warning micro version",
        "警告を表示する最小バージョンのマイクロ値です。",
        "Micro component of the minimum version that triggers a warning."
      ),
      errorMajor: jaEnField(
        "拒否メジャーバージョン",
        "Error major version",
        "利用を拒否する最小バージョンのメジャー値です。",
        "Major component of the minimum version that blocks use."
      ),
      errorMinor: jaEnField(
        "拒否マイナーバージョン",
        "Error minor version",
        "利用を拒否する最小バージョンのマイナー値です。",
        "Minor component of the minimum version that blocks use."
      ),
      errorMicro: jaEnField(
        "拒否マイクロバージョン",
        "Error micro version",
        "利用を拒否する最小バージョンのマイクロ値です。",
        "Micro component of the minimum version that blocks use."
      ),
      acceptedMajor: jaEnField(
        "同意済みメジャーバージョン",
        "Accepted major version",
        "プレイヤーが同意した規約バージョンのメジャー値です。",
        "Major component of the agreement version accepted by the player."
      ),
      acceptedMinor: jaEnField(
        "同意済みマイナーバージョン",
        "Accepted minor version",
        "プレイヤーが同意した規約バージョンのマイナー値です。",
        "Minor component of the agreement version accepted by the player."
      ),
      acceptedMicro: jaEnField(
        "同意済みマイクロバージョン",
        "Accepted micro version",
        "プレイヤーが同意した規約バージョンのマイクロ値です。",
        "Micro component of the agreement version accepted by the player."
      ),
    })
);

const EmbeddedVersion = defineDomainType("EmbeddedVersion", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("warningMajor").masterData().required())
    .property(PT.int32("warningMinor").masterData().required())
    .property(PT.int32("warningMicro").masterData().required())
    .property(PT.int32("errorMajor").masterData().required())
    .property(PT.int32("errorMinor").masterData().required())
    .property(PT.int32("errorMicro").masterData().required())
    .localizedProperties({
      id: jaEnId("アプリバージョン", "application version configuration"),
      warningMajor: jaEnField(
        "警告メジャーバージョン",
        "Warning major version",
        "更新警告を表示する最小アプリバージョンのメジャー値です。",
        "Major component of the minimum app version that triggers an update warning."
      ),
      warningMinor: jaEnField(
        "警告マイナーバージョン",
        "Warning minor version",
        "更新警告を表示する最小アプリバージョンのマイナー値です。",
        "Minor component of the minimum app version that triggers an update warning."
      ),
      warningMicro: jaEnField(
        "警告マイクロバージョン",
        "Warning micro version",
        "更新警告を表示する最小アプリバージョンのマイクロ値です。",
        "Micro component of the minimum app version that triggers an update warning."
      ),
      errorMajor: jaEnField(
        "必須更新メジャーバージョン",
        "Required major version",
        "利用を拒否する最小アプリバージョンのメジャー値です。",
        "Major component of the minimum app version allowed to run."
      ),
      errorMinor: jaEnField(
        "必須更新マイナーバージョン",
        "Required minor version",
        "利用を拒否する最小アプリバージョンのマイナー値です。",
        "Minor component of the minimum app version allowed to run."
      ),
      errorMicro: jaEnField(
        "必須更新マイクロバージョン",
        "Required micro version",
        "利用を拒否する最小アプリバージョンのマイクロ値です。",
        "Micro component of the minimum app version allowed to run."
      ),
    })
);

const AgreementVersionModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.version.VersionModel)
    .mountLocal(AgreementVersion)
    .bindings({
      name: Bind.domainProperty(Source.direct(AgreementVersion, "id")),
      approveRequirement: Bind.domainProperty(Source.direct(AgreementVersion, "required")),
      scope: Bind.static("active"),
      type: Bind.static("simple"),
      currentVersion: {
        major: Bind.domainProperty(Source.direct(AgreementVersion, "currentMajor")),
        minor: Bind.domainProperty(Source.direct(AgreementVersion, "currentMinor")),
        micro: Bind.domainProperty(Source.direct(AgreementVersion, "currentMicro")),
      },
      warningVersion: {
        major: Bind.domainProperty(Source.direct(AgreementVersion, "warningMajor")),
        minor: Bind.domainProperty(Source.direct(AgreementVersion, "warningMinor")),
        micro: Bind.domainProperty(Source.direct(AgreementVersion, "warningMicro")),
      },
      errorVersion: {
        major: Bind.domainProperty(Source.direct(AgreementVersion, "errorMajor")),
        minor: Bind.domainProperty(Source.direct(AgreementVersion, "errorMinor")),
        micro: Bind.domainProperty(Source.direct(AgreementVersion, "errorMicro")),
      },
    })
);

export const foundationLiveopsVersion = definePackage("foundation-liveops-version", "0.0.0")
  .display({
    label: { ja: "バージョン管理", en: "Version Gate" },
    description: {
      ja: "利用規約の同意バージョンやアプリの埋め込みバージョンを管理します。",
      en: "Tracks agreement (terms of service) versions and the app's embedded version.",
    },
  })
  .displayType(AgreementVersion, {
    label: { ja: "規約バージョン", en: "Agreement version" },
    description: {
      ja: "利用規約やプライバシーポリシーの公開バージョンを管理します。",
      en: "Manages published versions of agreements such as terms of service and privacy policies.",
    },
  })
  .displayType(EmbeddedVersion, {
    label: { ja: "アプリバージョン", en: "App version" },
    description: {
      ja: "利用可能なアプリバージョンと更新時の扱いを設定します。",
      en: "Defines supported application versions and the required update behavior.",
    },
  })
  .domainType(AgreementVersion)
  .domainType(EmbeddedVersion)
  .masterDataResource(r =>
    r
      .model(GS2.version.Namespace)
      .bindings({
        name: Bind.static("Version"),
      })
      .addChild(AgreementVersionModel)
      .addChild(child => {
        child
          .model(GS2.version.VersionModel)
          .mountLocal(EmbeddedVersion)
          .bindings({
            name: Bind.domainProperty(Source.direct(EmbeddedVersion, "id")),
            scope: Bind.static("passive"),
            type: Bind.static("simple"),
            needSignature: Bind.static(false),
            warningVersion: {
              major: Bind.domainProperty(Source.direct(EmbeddedVersion, "warningMajor")),
              minor: Bind.domainProperty(Source.direct(EmbeddedVersion, "warningMinor")),
              micro: Bind.domainProperty(Source.direct(EmbeddedVersion, "warningMicro")),
            },
            errorVersion: {
              major: Bind.domainProperty(Source.direct(EmbeddedVersion, "errorMajor")),
              minor: Bind.domainProperty(Source.direct(EmbeddedVersion, "errorMinor")),
              micro: Bind.domainProperty(Source.direct(EmbeddedVersion, "errorMicro")),
            },
          });
      })
  )

  .userDataResource(r =>
    r
      .model(GS2.version.AcceptVersion)
      .linkedMasterResourceId(AgreementVersionModel)
      .mountLocal(AgreementVersion)
      .existenceProperty("exists")
      .bindings({
        status: Bind.domainProperties([Source.direct(AgreementVersion, "status")]),
        userId: Bind.skip(),
        version: {
          major: Bind.domainProperty(Source.direct(AgreementVersion, "acceptedMajor")),
          minor: Bind.domainProperty(Source.direct(AgreementVersion, "acceptedMinor")),
          micro: Bind.domainProperty(Source.direct(AgreementVersion, "acceptedMicro")),
        },
        versionName: Bind.skip(),
      })
  )

  .build();
