import { Architecture, COMPONENT_SIZE } from './architecture-svg.mjs'

// Diagram labels describe the current core tutorial; prose remains in Markdown.
export function addCoreDiagrams(add) {
  const save = (name, diagram) => add(`tutorials/assets/core_${name}.svg`, diagram)
  const auth = (d, x, y, product = true) => d.card('as', x, y, ['Authorization', 'Server (AS)'], { kind: 'zts', sub: product ? ['Athenz'] : [] })
  const provider = (d, x, y) => d.card('idp', x, y, 'IdP', { sub: ['Keycloak'] })
  const identityAS = (d, x, y, product = true) => d.card('idp-as', x, y, 'IdP AS', { kind: 'plugin', sub: product ? ['Athenz'] : [] })
  const agent = (d, x, y, options = {}) => d.card('client', x, y, 'AI Agent', { ...options, sub: ['Codex, Claude Code, etc.', ...(options.sub ?? [])] })
  const resource = (d, x, y, options = {}) => d.card('api', x, y, 'Resource Server', { ...options, sub: ['api.idthw-api'] })
  const column = index => 48 + index * (COMPONENT_SIZE.width + 120)
  const viaY = (from, to, y) => [from, [from[0], y], [to[0], y], to]
  const docs = (d, api, client, y) => d.edge(viaY(api.bottom(), client.bottom(), y), { tone: 'green', dash: true, label: 'Documents', at: [(client.bottom()[0] + api.bottom()[0]) / 2, y - 19] })

  {
    const d = new Architecture(1160, 392, 'Document access with token enforcement disabled')
    const human = d.card('human', 64, 96, 'Human')
    const api = resource(d, 816, 96)
    d.edge([human.right(.3), api.left(.3)], { label: 'GET /api/docs', at: [580, 128] })
    d.edge([api.left(.7), human.right(.7)], { tone: 'green', dash: true, label: 'Documents', at: [580, 276] })
    save('04_open_api', d)
  }

  {
    const d = new Architecture(1000, 744, 'Learner identity and protected API in separate Athenz domains', 'Athenz is the Authorization Server. The human domain contains the new learner identity human.idjag-learner. The api domain contains the protected Resource Server api.idthw-api. The learner has not yet been granted the document-reading role.')
    auth(d, 360, 64)
    const human = d.card('human', 112, 448, 'Human', { sub: ['human.idjag-learner'] })
    const api = resource(d, 608, 448, { tag: 'protected' })
    d.group([human], 'DOMAIN · human')
    d.group([api], 'DOMAIN · api')
    save('07_learner_identity', d)
  }

  for (const learner of [false, true]) {
    const d = new Architecture(1240, 688, 'Certificate authentication and protected API access')
    const human = d.card('human', 64, 376, 'Human', { sub: [learner ? 'human.idjag-learner' : 'user.athenz_admin'] })
    const api = resource(d, 896, 376, { tag: 'api' })
    const zts = auth(d, 500, 64)
    d.edge([[288, human.y], zts.left()], { label: 'Request AT', secondary: 'X.509', at: [294, 262] })
    d.edge([zts.left(.88), human.right(.1)], { tone: 'green', dash: true, label: 'AT · aud=api', at: [535, 328], token: 'access' })
    d.edge([human.right(.45), api.left(.45)], { label: 'GET /api/docs', secondary: 'Access token', at: [620, 432], token: 'access', tokenAt: [620, 501] })
    docs(d, api, human, 632)
    save(learner ? '07_learner_access' : '06_admin_access', d)
  }

  {
    const d = new Architecture(1160, 392, 'MCP adapter and protected API')
    const mcp = d.card('mcp', 64, 96, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = resource(d, 816, 96, { tag: 'api' })
    d.edge([mcp.right(.3), api.left(.3)], { label: 'GET /api/docs', secondary: 'Exchanged AT', at: [580, 122], token: 'exchanged', tokenAt: [580, 188] })
    d.edge([api.left(.74), mcp.right(.74)], { tone: 'green', dash: true, label: 'Documents', at: [580, 278] })
    save('08_mcp_api', d)
  }

  for (const allowed of [false, true]) {
    const d = new Architecture(1440, 746, 'MCP tool call and downstream token exchange')
    const client = agent(d, 64, 432)
    const mcp = d.card('mcp', 580, 432, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = resource(d, 1096, 432, { inactive: !allowed, tag: 'api' })
    const zts = auth(d, 580, 64)
    d.edge([client.right(.45), mcp.left(.45)], { label: 'tools/call', secondary: 'aud=api', at: [462, 488], token: 'access', tokenAt: [462, 556] })
    d.edge([mcp.top(.25), zts.bottom(.25)], { label: 'Exchange AT', at: [524, 341], token: 'access' })
    d.edge([zts.bottom(.75), mcp.top(.75)], { tone: allowed ? 'green' : 'red', dash: true, label: allowed ? 'AT · aud=api' : 'Permission denied', at: [912, 341], token: allowed ? 'exchanged' : undefined })
    if (allowed) {
      d.edge([mcp.right(.45), api.left(.45)], { label: 'GET /api/docs', secondary: 'Exchanged AT', at: [978, 488], token: 'exchanged', tokenAt: [978, 556] })
      docs(d, api, client, 690)
    }
    save(allowed ? '10_exchange_allowed' : '09_exchange_denied', d)
  }

  {
    const d = new Architecture(1576, 824, 'Protected MCP calls use separate MCP and API audiences')
    const client = agent(d, column(0), 456)
    const proxy = d.card('proxy', column(1), 456, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    const mcp = d.card('mcp', column(2), 456, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = resource(d, column(3), 456, { tag: 'api' })
    const zts = auth(d, column(2), 64)
    d.group([proxy, mcp], 'MCP DEPLOYMENT')
    d.edge([client.right(.43), proxy.left(.43)], { label: 'AT · mcp', at: [388, 514], size: 17, token: 'access', tokenAt: [388, 576] })
    d.edge([proxy.right(.43), mcp.left(.43)], { label: 'tools/call', at: [788, 514], size: 17, token: 'access', tokenAt: [788, 576] })
    d.edge([mcp.right(.43), api.left(.43)], { label: 'AT · api', at: [1188, 514], size: 17, token: 'exchanged', tokenAt: [1188, 576] })
    d.edge([mcp.top(.25), zts.bottom(.25)], { label: 'Exchange AT', at: [806, 344], token: 'access' })
    d.edge([zts.bottom(.75), mcp.top(.75)], { tone: 'green', dash: true, label: 'AT · aud=api', at: [1166, 374], token: 'exchanged' })
    docs(d, api, client, 764)
    save('11_protected_mcp', d)
  }

  {
    const d = new Architecture(1160, 392, 'MCP Runtime Proxy rejects a token for the API audience')
    const client = agent(d, 64, 96, { tag: 'api', sub: ['aud=api'] })
    const proxy = d.card('proxy', 816, 96, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    d.edge([client.right(.3), proxy.left(.3)], { label: 'tools/call', at: [580, 128], token: 'access', tokenAt: [580, 188] })
    d.edge([proxy.left(.7), client.right(.7)], { tone: 'red', dash: true, label: '401 Unauthorized', secondary: 'Wrong audience', at: [580, 278] })
    save('11_mcp_rejected', d)
  }

  {
    const d = new Architecture(1160, 392, 'The IdP AS does not yet trust the IdP')
    const idp = provider(d, 64, 96)
    const zts = identityAS(d, 816, 96)
    d.edge([zts.left(), idp.right()], { tone: 'red', dash: true, label: 'Not trusted', at: [580, 168], size: 20 })
    save('12_idp_untrusted', d)
  }

  {
    const d = new Architecture(600, 424, 'Token exchange provider installed in the IdP AS')
    const plugin = d.card('plugin', 160, 112, ['Token exchange', 'provider'], { sub: ['keycloak-token-provider.jar'] })
    d.group([plugin], 'IdP AS', { product: 'Athenz' })
    save('13_provider_installed', d)
  }

  {
    const d = new Architecture(1352, 456, 'The IdP AS verifies the IdP token')
    const idp = provider(d, 64, 128)
    const plugin = d.card('plugin', 580, 128, ['Token exchange', 'provider'], { sub: ['human.idjag-learner'] })
    const file = d.card('file', 976, 128, 'providers.json')
    d.group([plugin, file], 'IdP AS', { product: 'Athenz' })
    d.edge([plugin.left(), idp.right()], { tone: 'gray', dash: true, label: 'Verify with JWKS', at: [462, 200] })
    d.edge([file.left(), plugin.right()], { tone: 'gray', label: 'Config', at: [918, 200], size: 16 })
    save('13_provider_trust', d)
  }

  {
    const d = new Architecture(1624, 808, 'Configured AI client gateway and protected MCP route')
    const idp = provider(d, column(1), 80)
    const idpAs = identityAS(d, column(2), 80, false)
    const as = auth(d, column(3), 80, false)
    d.group([idpAs, as], 'Athenz')
    const client = agent(d, column(0), 528)
    const gateway = d.card('gateway', column(1), 528, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    const proxy = d.card('proxy', column(2), 528, ['MCP Runtime', 'Proxy'])
    const mcp = d.card('mcp', column(3), 528, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    d.edge([gateway.top(), idp.bottom()], { tone: 'gray', dash: true, label: 'OIDC', at: [516, 418] })
    d.edge(viaY(gateway.top(.7), idpAs.bottom(.25), 380), { tone: 'gray', dash: true, label: 'ID token → ID-JAG', at: [781, 360] })
    d.edge(viaY(gateway.top(.9), as.bottom(.25), 440), { tone: 'gray', dash: true, label: 'ID-JAG → AT', at: [1060, 420] })
    d.edge([client.right(.43), gateway.left(.43)], { label: 'MCP', at: [388, 586], size: 17 })
    d.edge([gateway.right(.43), proxy.left(.43)], { label: 'Upstream', at: [788, 586], size: 17 })
    d.edge([proxy.right(.43), mcp.left(.43)], { label: 'MCP', at: [1188, 586], size: 17 })
    save('14_gateway_route', d)
  }

  {
    const d = new Architecture(1432, 728, 'Sign-in succeeds before ID-JAG delegation is denied')
    const human = d.card('human', 64, 64, 'Human')
    const idp = provider(d, 480, 64)
    const zts = identityAS(d, 1088, 64)
    const client = agent(d, 64, 440)
    const gateway = d.card('gateway', 480, 440, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    d.edge([human.right(.44), idp.left(.44)], { label: 'Login', at: [412, 124] })
    d.edge([human.bottom(), client.top()], { label: 'Prompt', at: [204, 360] })
    d.edge([idp.bottom(), gateway.top()], { tone: 'green', dash: true, label: 'ID token', at: [700, 356] })
    d.edge([client.right(.4), gateway.left(.4)], { label: 'MCP', at: [412, 488] })
    d.edge([gateway.right(.4), [1158, 520], zts.bottom(.25)], { label: 'ID token → ID-JAG', at: [924, 488] })
    d.edge([zts.bottom(.75), [1298, 588], gateway.right(.74)], { tone: 'red', dash: true, label: 'Permission denied', secondary: 'zts.jag_exchange', at: [924, 630] })
    save('14_idjag_denied', d)
  }

  {
    const d = new Architecture(1976, 1008, 'Core tutorial: an AI agent retrieves API documents for a signed-in user', 'The IdP authenticates the human. AI Client Gateway obtains ID-JAG from the IdP AS, then exchanges it for an MCP-audience access token at the Authorization Server. Keycloak implements the IdP; one Athenz deployment implements both authorization-server roles. MCP Runtime Proxy validates MCP access. The MCP adapter exchanges the token at the AS for an API-audience token. The API returns documents.')
    const human = d.card('human', column(0), 80, 'Human', { sub: ['human.idjag-learner'] })
    const idp = provider(d, column(1), 80)
    const idpAs = identityAS(d, column(2), 80, false)
    const as = auth(d, column(3), 80, false)
    d.group([idpAs, as], 'Athenz')
    const client = agent(d, column(0), 640)
    const gateway = d.card('gateway', column(1), 640, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    const proxy = d.card('proxy', column(2), 640, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    const mcp = d.card('mcp', column(3), 640, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = resource(d, column(4), 640, { tag: 'api' })
    d.group([proxy, mcp], 'MCP DEPLOYMENT')
    d.edge([human.right(.42), idp.left(.42)], { label: 'Login', at: [388, 136], size: 17 })
    d.edge([human.bottom(), client.top()], { label: 'Prompt', at: [188, 460] })
    d.edge([idp.bottom(.1), gateway.top(.1)], { tone: 'green', dash: true, label: 'ID token', at: [476, 585] })
    d.edge([idpAs.left(.42), idp.right(.42)], { tone: 'gray', dash: true, label: 'JWKS', at: [788, 136] })
    d.edge(viaY(gateway.top(.3), idpAs.bottom(.2), 350), { label: 'ID token', at: [714, 330] })
    d.edge(viaY(idpAs.bottom(.4), gateway.top(.5), 410), { tone: 'green', dash: true, label: 'ID-JAG', at: [774, 390] })
    d.edge(viaY(gateway.top(.7), as.bottom(.1), 470), { label: 'ID-JAG', at: [1072, 450] })
    d.edge(viaY(as.bottom(.25), gateway.top(.9), 530), { tone: 'green', dash: true, label: 'AT · aud=mcp', at: [1112, 510], token: 'access', tokenAt: [1208, 530] })
    d.edge([mcp.top(.55), as.bottom(.55)], { label: 'Exchange AT', at: [1402, 340], token: 'access', tokenAt: [1402, 550] })
    d.edge([as.bottom(.85), mcp.top(.85)], { tone: 'green', dash: true, label: 'AT · aud=api', at: [1486, 470], token: 'exchanged', tokenAt: [1486, 396] })
    d.edge([client.right(.46), gateway.left(.46)], { label: 'MCP', at: [388, 704], size: 17 })
    d.edge([gateway.right(.46), proxy.left(.46)], { label: 'mcp AT', at: [788, 704], size: 17, token: 'access', tokenAt: [788, 766] })
    d.edge([proxy.right(.46), mcp.left(.46)], { label: 'tools/call', at: [1188, 704], size: 16, token: 'access', tokenAt: [1188, 766] })
    d.edge([mcp.right(.46), api.left(.46)], { label: 'api AT', at: [1588, 704], size: 17, token: 'exchanged', tokenAt: [1588, 766] })
    docs(d, api, client, 948)
    save('15_idjag_flow', d)
  }

  {
    const d = new Architecture(1400, 856, 'Core tutorial delegation permissions')
    const rows = [
      { y: 64, kind: 'human', title: 'Human', sub: 'human.idjag-learner', label: 'Member', lines: ['mcp:role.mcp-accessor', 'api:role.docs-getter'] },
      { y: 328, kind: 'gateway', title: ['AI Client', 'Gateway'], sub: 'human.idjag-learner.claude', label: 'zts.jag_exchange', lines: ['mcp:role.mcp-accessor', 'api:role.docs-getter'] },
      { y: 592, kind: 'mcp', title: 'MCP server', sub: 'mcp.idthw-api-mcp', label: 'Exchange', lines: ['zts.token_source_exchange · mcp:api', 'zts.token_target_exchange', 'api:mcp:role.docs-getter'] }
    ]
    for (const row of rows) {
      const service = d.card(row.kind, 64, row.y, row.title, { sub: [row.sub] })
      d.nodes.push(`<rect x="736" y="${row.y}" width="600" height="${COMPONENT_SIZE.height}" rx="18" fill="#F7F6FB" stroke="#E5E0EE" stroke-width="1.2"/>`)
      const firstLineY = row.y + COMPONENT_SIZE.height / 2 - (row.lines.length - 1) * 37 / 2 + 6
      row.lines.forEach((line, i) => d.nodes.push(d.text(764, firstLineY + i * 37, line, { size: 18, mono: true, color: '#5C5575' })))
      d.edge([service.right(.45), [736, service.right(.45)[1]]], { tone: 'purple', label: row.label, at: [540, service.right(.45)[1] - 29] })
    }
    save('permissions', d)
  }
}
