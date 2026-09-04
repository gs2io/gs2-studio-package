# gs2-studio-package

GS2 Studio で利用する公式パッケージ定義とサンプルプロジェクトを管理するリポジトリです。

## 構成

- `index.json` - GS2 Studio の Simple Mode が表示・導入する機能の公開インデックス
- `<package-id>/dsl/index.ts` - パッケージ定義の source of truth
- `<package-id>/dsl/id-ledger.json` - 構造 token ごとの生成 ID を固定する独立 ledger
- `<package-id>/project.json` - GS2 Studio で読み込める生成済みプロジェクト
- `<package-id>/packages/<package-id>/` - 生成済みパッケージデータ
- `sample-*`, `rename-overlay-sample` - GS2 Studio の回帰検証用プロジェクト

`index.json` の `features[].id` は、対応するディレクトリ名および生成済み
`package.json` の `id` と一致させます。`dependsOn` は各パッケージの直接依存だけを
列挙します。`install.url` には公開 GitHub リポジトリ内の生成済みパッケージ
ディレクトリを指す `https://github.com/<owner>/<repo>/tree/<ref>/<path>` URL を指定します。
インデックス掲載パッケージの `package.json` に記録する依存元は
`github:gs2io/gs2-studio-package` とし、ローカルの `file:` URL は使用しません。

GS2 Studio は `main` のような可変 ref を index 取得時のコミット SHA に固定し、
同じコミットから index、`package.json`、パッケージアーカイブを取得します。

## 更新

このリポジトリは GS2 Studio の `packages/` submodule として参照されます。
DSL の materialize と整合性検査は、互換な GS2 Studio checkout から実行します。

```bash
git submodule update --init
npm run materialize:packages
npm run check:package-materialization
```

`id-ledger.json` の `random` は DomainType / property / row / ActionTransform の
非決定的 ID を固定します。resource / UI は DSL の決定的 ID を再計算し、旧採番を維持する
必要があるものだけ `deterministicOverrides` に記録します。生成済み JSON は ID の継承元では
ありません。新しい非決定的要素を追加した場合は gate が示す token と候補 ID を確認して
ledger へ追加します。rename では既存 ID を新 token へ移します。削除時は active section の
token と ID を `retired` へ移し、現行 identity に再適用されない tombstone として予約します。
override のない決定的 ID は削除前に token と計算済み ID を `retired` へ追加してください。

新規パッケージの ledger は次の canonical JSON から開始します。

```json
{
  "schemaVersion": 1,
  "retired": {},
  "random": {},
  "deterministicOverrides": {}
}
```

パッケージ側の変更を先にこのリポジトリへコミットし、その後 GS2 Studio 側で
submodule の参照コミットを更新してください。submodule は DSL の materialize と
整合性検査に使われます。配布済みアプリの Simple Mode は GitHub 上の最新 index を
HTTPS で取得するため、一覧とパッケージを更新するときに Studio2 本体を再ビルドする
必要はありません。
