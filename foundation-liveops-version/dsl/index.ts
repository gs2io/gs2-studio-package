import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

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
