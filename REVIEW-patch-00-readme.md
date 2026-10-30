# `patch-00-readme` 日本語チュートリアルのレビュー要約

対象: [導入](tutorials/japanese/00-README.md)と[04章](tutorials/japanese/04-resource-server.md)〜[15章](tutorials/japanese/15-id-jag.md)に書き込まれたレビュー、および実行中に共有された結果。これは修正案と観測の記録であり、指摘の解決や全手順の成功を示すものではありません。

## 説明の軸

- **読者が初めて見る概念を、その場で説明する。** [導入](tutorials/japanese/00-README.md)の IdP AS、[05章](tutorials/japanese/05-authorization-server.md)の Athenz ドメインと複数ドメインのスコープ、[06〜07章](tutorials/japanese/06-access-token.md)の RBAC・ロール・プリンシパル・サービス ID・X.509 証明書は、設定コマンドより前に役割を示す。演習用ユーザーと管理者の違いも明確にする。
- **通信路の信頼とトークンの検証を分ける。** [06章](tutorials/japanese/06-access-token.md)では、CA 証明書を使う ZTS への HTTPS 接続と、ZTS の公開鍵を使うアクセストークンの署名検証を別々に説明する。どの文書操作にどのスコープが必要かは API 側の実装で定義し、ZTS はトークンの発行を制御する、と責務を明示する。
- **各段階で誰が何を持ち、何を検証するかを追えるようにする。** [08〜11章](tutorials/japanese/08-mcp-server-for-resource-server.md)では、MCP の初期化とツール一覧取得、MCP 宛てトークンの検証、API 宛てトークンへの交換を区別する。Runtime Proxy がトークンの検証と交換を担当し、MCP アプリは渡された API トークンを使う。リクエストごとのトークンファイルを削除する理由や、サービス証明書によるプロキシの認証も説明する。
- **ログインから委任までの流れを図と文章でつなぐ。** [12〜15章](tutorials/japanese/12-identity-provider.md)では、Keycloak の Client とユーザーログイン、ブラウザーから Gateway の `/oauth/callback` に戻る認可コード、Gateway が取得する ID トークン、Athenz が発行する ID-JAG、MCP 宛てアクセストークン、Runtime Proxy が交換する API 宛てアクセストークンを順に示す。ID-JAG は Athenz 固有の用語ではなく、Athenz はこの構成で発行者を担う。ID トークンから直接アクセストークンを得る構成との違い、Gateway のサービス ID と Codex の名前の関係、`zts.jag_exchange` が必要な理由は、まだ説明を要する論点として残っている。

## 章ごとの読みやすさと手順

| 箇所 | レビューで挙がった点 |
|---|---|
| [導入](tutorials/japanese/00-README.md)、[04〜07章](tutorials/japanese/04-resource-server.md) | 最初の構成図と処理の概要は前提知識を求めすぎる。見出しや「保護された API」「演習者」などの語を自然にし、rollout の目的、管理者と演習用ユーザーの使い分け、証明書取得とリクエスト主体の認証を説明する。 |
| [08〜09章](tutorials/japanese/08-mcp-server-for-resource-server.md) | MCP の「初期化レスポンス」「ツール検出」の意味を説明する。ツール一覧取得と文書 API 呼び出しでは認証が必要になる段階が異なる。環境によって起動・検出に時間がかかることも示す。 |
| [10〜11章](tutorials/japanese/10-protect-mcp-server.md) | MCP の保護と資格情報の変更を別の目的として説明する。Runtime Proxy の名前と役割、CA の参照先、想定される 401・502・403 の原因を明確にする。文書取得が意図的に失敗する段階は**コマンドの前**に目立たせる。Codex の再起動やセッション更新が必要になる条件も確認する。 |
| [12〜13章](tutorials/japanese/12-identity-provider.md) | Keycloak Client、realm、ユーザーを初学者向けに説明し、ブラウザーを開く手順の必要性を見直す。ZTS のプラグイン JAR と `providers.json` の役割、Keycloak の署名鍵を取得して ID トークンを検証する順序、`preferred_username` と Athenz プリンシパルの対応を説明する。 |
| [14章](tutorials/japanese/14-ai-client-gateway.md) | Gateway が Codex と MCP の間で何を中継するかを最初に示す。`KEYCLOAK_CLIENT_ID`/`SECRET` は Gateway の OAuth クライアント認証用で、ユーザーのログイン用ではない。`KEYCLOAK_URL` は Gateway から Keycloak、`KEYCLOAK_PUBLIC_URL` はブラウザーから Keycloak、`PUBLIC_BASE_URL` は Codex とブラウザーから Gateway のアドレスとして図示する。起動ログの成功条件と、Codex 設定から古い `Authorization` ヘッダーを外す確認方法を示す。意図的な `failed (0 tools)` は実行前に予告する。 |
| [15章](tutorials/japanese/15-id-jag.md) | `zts.jag_exchange` を Athenz の権限として説明する。Gateway が ID-JAG から MCP 宛てトークンを得て、Runtime Proxy が API 宛てトークンへ交換する二段階を再確認する。結びの「委任」や Athenz のポリシー反映に関する説明は、章の学習目標に合わせて整理する。 |

## 実行時に観測した問題と確認状況

- クラスタ再作成後、API・MCP・Keycloak の Pod は Ready だったが、再作成された Athenz では `human` が HTTP 200、`api` と `mcp` のドメイン・ロール・ポリシーが HTTP 404 だった。作成スクリプトの成功表示だけで存在を判断せず、ZMS の GET で確認する必要がある。API・MCP 側に残った CA とサービス証明書が新しい Athenz と一致するかも確認対象だった。
- [13章](tutorials/japanese/13-trusted-identity-provider.md)の ZTS rollout は、新しい Pod が readiness と liveness probe に失敗して進まなかった。`/zts/v1/status` は HTTP 503、ログには `providers.json` の `NoSuchFileException` があった。ConfigMap の `providers.json` キーは存在した一方、その時点の Deployment では対応する volume と volumeMount を確認できなかった。プラグイン配置の報告はあったが、最終的な rollout 成功は確認できていない。
- [14章](tutorials/japanese/14-ai-client-gateway.md)では Keycloak クライアント `human.idjag-learner.codex` が見つからず、Secret 作成が失敗した。別の時点では ZTS の `zms_client_keystore.pkcs12` 欠落も報告された。現在のクラスタで両者が解消したかは未確認。
- `failed (0 tools)` は [14章](tutorials/japanese/14-ai-client-gateway.md)の権限付与前には想定されるが、ZTS の障害や Keycloak の設定失敗でも起こり得る。表示だけで原因を決めず、Gateway と ZTS のログで切り分ける。Gateway → MCP → 文書 API の最終動作も未確認。
