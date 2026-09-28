import {
  Bind,
  defineDomainType,
  defineMasterDataResource,
  definePackage,
  PT,
  Source,
  transactionSetting,
} from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const AgreementVersion = defineDomainType("AgreementVersion", dt =>
  dt
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
        "この規約への同意を必須にするかを設定します。任意にすると拒否もできますが、同意も拒否もしていないプレイヤーはバージョン確認でエラーになります。",
        "Whether approval of this agreement is required. An optional one can also be rejected, but a player who has neither accepted nor rejected it fails the version check."
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
        "このバージョン以下に同意しているとき警告になるバージョンのメジャー値です。",
        "Major component of the version at or below which an acceptance triggers a warning."
      ),
      warningMinor: jaEnField(
        "警告マイナーバージョン",
        "Warning minor version",
        "このバージョン以下に同意しているとき警告になるバージョンのマイナー値です。",
        "Minor component of the version at or below which an acceptance triggers a warning."
      ),
      warningMicro: jaEnField(
        "警告マイクロバージョン",
        "Warning micro version",
        "このバージョン以下に同意しているとき警告になるバージョンのマイクロ値です。",
        "Micro component of the version at or below which an acceptance triggers a warning."
      ),
      errorMajor: jaEnField(
        "拒否メジャーバージョン",
        "Error major version",
        "このバージョン以下に同意しているとき利用を拒否するバージョンのメジャー値です。",
        "Major component of the version at or below which an acceptance blocks use."
      ),
      errorMinor: jaEnField(
        "拒否マイナーバージョン",
        "Error minor version",
        "このバージョン以下に同意しているとき利用を拒否するバージョンのマイナー値です。",
        "Minor component of the version at or below which an acceptance blocks use."
      ),
      errorMicro: jaEnField(
        "拒否マイクロバージョン",
        "Error micro version",
        "このバージョン以下に同意しているとき利用を拒否するバージョンのマイクロ値です。",
        "Micro component of the version at or below which an acceptance blocks use."
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
    .property(PT.int32("warningMajor").masterData().required())
    .property(PT.int32("warningMinor").masterData().required())
    .property(PT.int32("warningMicro").masterData().required())
    .property(PT.int32("errorMajor").masterData().required())
    .property(PT.int32("errorMinor").masterData().required())
    .property(PT.int32("errorMicro").masterData().required())
    .localizedProperties({
      id: jaEnId("申告バージョン", "reported version"),
      warningMajor: jaEnField(
        "警告メジャーバージョン",
        "Warning major version",
        "申告されたバージョンがこれ以下のとき更新を促す警告になるバージョンのメジャー値です。",
        "Major component of the version at or below which a reported version triggers an update warning."
      ),
      warningMinor: jaEnField(
        "警告マイナーバージョン",
        "Warning minor version",
        "申告されたバージョンがこれ以下のとき更新を促す警告になるバージョンのマイナー値です。",
        "Minor component of the version at or below which a reported version triggers an update warning."
      ),
      warningMicro: jaEnField(
        "警告マイクロバージョン",
        "Warning micro version",
        "申告されたバージョンがこれ以下のとき更新を促す警告になるバージョンのマイクロ値です。",
        "Micro component of the version at or below which a reported version triggers an update warning."
      ),
      errorMajor: jaEnField(
        "必須更新メジャーバージョン",
        "Required major version",
        "申告されたバージョンがこれ以下のとき利用を拒否するバージョンのメジャー値です。",
        "Major component of the version at or below which a reported version is refused."
      ),
      errorMinor: jaEnField(
        "必須更新マイナーバージョン",
        "Required minor version",
        "申告されたバージョンがこれ以下のとき利用を拒否するバージョンのマイナー値です。",
        "Minor component of the version at or below which a reported version is refused."
      ),
      errorMicro: jaEnField(
        "必須更新マイクロバージョン",
        "Required micro version",
        "申告されたバージョンがこれ以下のとき利用を拒否するバージョンのマイクロ値です。",
        "Micro component of the version at or below which a reported version is refused."
      ),
    })
);

/**
 * The version gate itself. When a player's check finds no errors, GS2 signs
 * them in as `assumeUserId` and hands back that user's project token, so the
 * gate is where a title names that user. The namespace is mounted on it, so
 * a project that authors no gate deploys no namespace: GS2 requires the user.
 */
const VersionGate = defineDomainType("VersionGate", dt =>
  dt
    .singleEntry()
    .property(
      PT.string("assumeUserId")
        .masterData()
        .required()
        .description(
          "GRN of the GS2-Identifier user a player who passes the check is signed in as: grn:gs2::{ownerId}:identifier:user:<name>"
        )
    )
    .localizedProperties({
      id: jaEnId("バージョン確認", "version gate"),
      assumeUserId: jaEnField(
        "通過後のユーザー",
        "User after passing",
        "バージョン確認を通過したプレイヤーに発行するプロジェクトトークンの GS2-Identifier ユーザーです。grn:gs2::{ownerId}:identifier:user:<名前> の形式で指定します。",
        "GS2-Identifier user whose project token a player receives on passing the version check, as grn:gs2::{ownerId}:identifier:user:<name>."
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
      ja: "利用規約の同意バージョンと、アプリやアセットのようにクライアントが申告するバージョンを確認します。",
      en: "Checks the agreement (terms of service) versions a player accepted, and the versions a client reports, such as its app and asset versions.",
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
    label: { ja: "申告バージョン", en: "Reported version" },
    description: {
      ja: "アプリやアセットのように、クライアントが自分のバージョンを申告して確認を受けるものです。警告と利用拒否になるバージョンを設定します。",
      en: "Something the client reports its own version of, such as the app or its assets, and the versions at or below which that version warns or is refused.",
    },
  })
  .displayType(VersionGate, {
    label: { ja: "バージョン確認", en: "Version gate" },
    description: {
      ja: "バージョン確認を通過したプレイヤーをどのユーザーとして扱うかを設定します。この行が無いと、バージョン管理の名前空間とバージョンモデルはデプロイされません。",
      en: "Configures which user a player who passes the version check is signed in as. Without this row, the version namespace and its version models are not deployed.",
    },
  })
  .domainType(VersionGate)
  .domainType(AgreementVersion)
  .domainType(EmbeddedVersion)
  .masterDataResource(r =>
    r
      .model(GS2.version.Namespace)
      .mountLocal(VersionGate)
      .bindings({
        name: Bind.static("Version"),
        assumeUserId: Bind.domainProperty(Source.direct(VersionGate, "assumeUserId")),
        ...Bind.nulls("acceptVersionScript", "checkVersionTriggerScriptId", "logSetting"),
        transactionSetting: transactionSetting(),
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
