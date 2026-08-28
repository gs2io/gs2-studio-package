import { Bind, defineDomainType, defineMasterDataResource, definePackage, PT, Source } from "~/dsl";
import { GS2 } from "~/dsl/gs2";

import { jaEnField, jaEnId } from "../../dsl/jaEnField";

const TakeOverSetting = defineDomainType("TakeOverSetting", dt =>
  dt
    .idDescription("Unique identifier")
    .property(PT.int32("type").masterData().description("Setting Type Number").required())
    .property(
      PT.string("configurationPath").masterData().description("OIDC Configuration URL").required()
    )
    .property(PT.string("clientId").masterData().description("OIDC Client ID").required())
    .property(PT.string("clientSecret").masterData().description("OIDC Secret").required())
    .property(
      PT.string("doneEndpointUrl")
        .masterData()
        .description("Redirect URL when login completed")
        .required()
    )
    .property(
      PT.string("appleTeamId").masterData().description("Apple Team ID(if Sign-in Apple Account)")
    )
    .property(
      PT.string("appleKeyId").masterData().description("Apple Key ID(if Sign-in Apple Account)")
    )
    .property(
      PT.string("applePrivateKeyPem")
        .masterData()
        .description("Apple Private Key PEM(if Sign-in Apple Account)")
    )
    .property(PT.bool("hasTakeOver").userData().description("Whether the user has TakeOver data"))
    .localizedProperties({
      id: jaEnId("引き継ぎ設定", "take-over setting"),
      type: jaEnField(
        "認証種別",
        "Authentication type",
        "引き継ぎに使用する認証方式の種別番号です。",
        "Numeric type of authentication used for account transfer."
      ),
      configurationPath: jaEnField(
        "OIDC設定URL",
        "OIDC configuration URL",
        "OpenID Connect設定ドキュメントのURLです。",
        "URL of the OpenID Connect configuration document."
      ),
      clientId: jaEnField(
        "クライアントID",
        "Client ID",
        "OIDCクライアントIDです。",
        "OIDC client identifier."
      ),
      clientSecret: jaEnField(
        "クライアントシークレット",
        "Client secret",
        "OIDC認証に使用するクライアントシークレットです。",
        "Client secret used for OIDC authentication."
      ),
      doneEndpointUrl: jaEnField(
        "完了後URL",
        "Completion URL",
        "ログイン完了後に遷移するURLです。",
        "URL opened after login completes."
      ),
      appleTeamId: jaEnField(
        "Apple Team ID",
        "Apple Team ID",
        "Sign in with Appleで使用するTeam IDです。",
        "Apple Team ID used for Sign in with Apple."
      ),
      appleKeyId: jaEnField(
        "Apple Key ID",
        "Apple Key ID",
        "Sign in with Appleで使用するKey IDです。",
        "Apple Key ID used for Sign in with Apple."
      ),
      applePrivateKeyPem: jaEnField(
        "Apple秘密鍵",
        "Apple private key",
        "Sign in with Appleで使用するPEM形式の秘密鍵です。",
        "PEM private key used for Sign in with Apple."
      ),
      hasTakeOver: jaEnField(
        "引き継ぎデータあり",
        "Has take-over data",
        "プレイヤーに引き継ぎデータが登録されているかを示します。",
        "Whether take-over data is registered for the player."
      ),
    })
);

const TakeOverTypeModel = defineMasterDataResource(resource =>
  resource
    .model(GS2.account.TakeOverTypeModel)
    .mountLocal(TakeOverSetting)
    .bindings({
      type: Bind.domainProperty(Source.direct(TakeOverSetting, "type")),
      openIdConnectSetting: {
        additionalReturnValues: Bind.static([]),
        additionalScopeValues: Bind.static([]),
        appleKeyId: Bind.domainProperty(Source.direct(TakeOverSetting, "appleKeyId")),
        applePrivateKeyPem: Bind.domainProperty(
          Source.direct(TakeOverSetting, "applePrivateKeyPem")
        ),
        appleTeamId: Bind.domainProperty(Source.direct(TakeOverSetting, "appleTeamId")),
        clientId: Bind.domainProperty(Source.direct(TakeOverSetting, "clientId")),
        clientSecret: Bind.domainProperty(Source.direct(TakeOverSetting, "clientSecret")),
        configurationPath: Bind.domainProperty(Source.direct(TakeOverSetting, "configurationPath")),
        doneEndpointUrl: Bind.domainProperty(Source.direct(TakeOverSetting, "doneEndpointUrl")),
      },
    })
);

export const foundationCoreIdentity = definePackage("foundation-core-identity", "0.0.0")
  .display({
    label: { ja: "引き継ぎ設定", en: "Account Transfer" },
    description: {
      ja: "機種変更時のアカウント引き継ぎコードを発行・管理します。",
      en: "Issues and manages transfer codes so players can move their account to a new device.",
    },
  })
  .displayType(TakeOverSetting, {
    label: { ja: "引き継ぎ設定", en: "Take-over setting" },
    description: {
      ja: "アカウント引き継ぎに使用するOIDC接続情報と認証設定を登録します。",
      en: "Configures the OIDC connection and authentication settings used for account transfer.",
    },
  })
  .domainType(TakeOverSetting)
  .instance(TakeOverSetting, "apple", {
    type: 0,
    configurationPath: "https://appleid.apple.com/.well-known/openid-configuration",
    clientId: "dummy",
    clientSecret: "dummy",
    doneEndpointUrl: "dummy",
    appleTeamId: "dummy",
    appleKeyId: "dummy",
    applePrivateKeyPem: "dummy",
  })
  .instance(TakeOverSetting, "google", {
    type: 1,
    configurationPath: "https://accounts.google.com/.well-known/openid-configuration",
    clientId: "dummy",
    clientSecret: "dummy",
    doneEndpointUrl: "dummy",
  })
  .masterDataResource(r =>
    r
      .model(GS2.account.Namespace)
      .bindings({
        name: Bind.static("Account"),
        authenticationScript: Bind.null(),
        banScript: Bind.null(),
        createAccountScript: Bind.null(),
        createTakeOverScript: Bind.null(),
        doTakeOverScript: Bind.null(),
        unBanScript: Bind.null(),
        logSetting: Bind.null(),
        transactionSetting: {
          acquireActionUseJobQueue: Bind.static(false),
          commitScriptResultInUseDistributor: Bind.static(false),
          distributorNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:distributor:default"),
          enableAtomicCommit: Bind.static(false),
          enableAutoRun: Bind.static(false),
          queueNamespaceId: Bind.static("grn:gs2:{region}:{ownerId}:queue:default"),
          transactionUseDistributor: Bind.static(false),
        },
      })
      .addChild(TakeOverTypeModel)
  )
  .userDataResource(r =>
    r
      .model(GS2.account.TakeOver)
      .linkedMasterResourceId(TakeOverTypeModel)
      .existenceProperty("hasTakeOver")
      .bindings({
        type: Bind.skip(),
        userId: Bind.skip(),
        userIdentifier: Bind.skip(),
      })
  )

  .build();
