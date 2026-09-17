import { Architecture } from './architecture-svg.mjs'

// Diagram labels describe the current core tutorial; prose remains in Markdown.
export function addCoreDiagrams(add) {
  const save = (name, diagram) => add(`tutorials/assets/core_${name}.svg`, diagram)
  const auth = (d, x, y, w = 390, h = 155) => d.card('zts', x, y, w, h, 'Athenz ZTS', { kind: 'zts', compact: true })
  const docs = (d, api, client, y) => d.edge([api.bottom(), [api.x + api.w / 2, y], [client.x + client.w / 2, y], client.bottom()], { tone: 'green', dash: true, label: 'Documents', at: [(client.x + client.w / 2 + api.x + api.w / 2) / 2, y - 19] })

  {
    const d = new Architecture(1160, 410, 'Document access with token enforcement disabled')
    const human = d.card('human', 64, 103, 282, 208, 'Human')
    const api = d.card('api', 814, 103, 282, 208, 'API server', { sub: ['api.idthw-api'] })
    d.edge([human.right(.31), api.left(.31)], { label: 'GET /api/docs', at: [580, 139] })
    d.edge([api.left(.7), human.right(.7)], { tone: 'green', dash: true, label: 'Documents', at: [580, 290] })
    save('04_open_api', d)
  }

  for (const learner of [false, true]) {
    const d = new Architecture(1240, 620, 'Certificate authentication and protected API access')
    const human = d.card('human', 64, 330, 268, 182, 'Human', { sub: [learner ? 'human.idjag-learner' : 'user.athenz_admin'] })
    const api = d.card('api', 908, 330, 268, 182, 'API server', { tag: 'api', sub: ['api.idthw-api'] })
    const zts = auth(d, 500, 58, 404, 148)
    d.edge([[302, human.y], zts.left()], { label: 'Request AT', secondary: 'X.509', at: [282, 204] })
    d.edge([[zts.x, 184], [human.x + human.w, 352]], { tone: 'green', dash: true, label: 'AT · aud=api', at: [495, 257], token: 'access', tokenAt: [410, 274] })
    d.edge([human.right(.45), api.left(.45)], { label: 'GET /api/docs', secondary: 'Access token', at: [620, 377], token: 'access', tokenAt: [620, 443] })
    docs(d, api, human, 568)
    save(learner ? '07_learner_access' : '06_admin_access', d)
  }

  {
    const d = new Architecture(1200, 370, 'MCP adapter and protected API')
    const mcp = d.card('mcp', 64, 92, 300, 194, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = d.card('api', 836, 92, 300, 194, 'API server', { tag: 'api', sub: ['api.idthw-api'] })
    d.edge([mcp.right(.33), api.left(.33)], { label: 'GET /api/docs', secondary: 'Exchanged AT', at: [600, 117], token: 'exchanged', tokenAt: [600, 176] })
    d.edge([api.left(.7), mcp.right(.7)], { tone: 'green', dash: true, label: 'Documents', at: [600, 264] })
    save('08_mcp_api', d)
  }

  for (const allowed of [false, true]) {
    const d = new Architecture(1400, 715, 'MCP tool call and downstream token exchange')
    const client = d.card('client', 56, 425, 272, 190, 'Claude Code')
    const mcp = d.card('mcp', 564, 425, 272, 190, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = d.card('api', 1072, 425, 272, 190, 'API server', { inactive: !allowed, tag: 'api', sub: ['api.idthw-api'] })
    const zts = auth(d, 490, 58, 420, 158)
    d.edge([client.right(.45), mcp.left(.45)], { label: 'tools/call', secondary: 'aud=api', at: [446, 474], token: 'access', tokenAt: [446, 540] })
    d.edge([mcp.top(.25), [632, zts.y + zts.h]], { label: 'Exchange AT', at: [507, 332], token: 'access' })
    d.edge([[768, zts.y + zts.h], mcp.top(.75)], { tone: allowed ? 'green' : 'red', dash: true, label: allowed ? 'AT · aud=api' : 'Permission denied', at: [890, 332], token: allowed ? 'exchanged' : undefined })
    if (allowed) {
      d.edge([mcp.right(.45), api.left(.45)], { label: 'GET /api/docs', secondary: 'Exchanged AT', at: [954, 474], token: 'exchanged', tokenAt: [954, 540] })
      docs(d, api, client, 663)
    }
    save(allowed ? '10_exchange_allowed' : '09_exchange_denied', d)
  }

  {
    const d = new Architecture(1560, 760, 'Protected MCP calls use separate MCP and API audiences')
    d.frame(414, 409, 724, 267, 'MCP DEPLOYMENT')
    const client = d.card('client', 48, 464, 254, 190, 'Claude Code')
    const proxy = d.card('proxy', 438, 464, 280, 190, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    const mcp = d.card('mcp', 834, 464, 280, 190, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = d.card('api', 1230, 464, 282, 190, 'API server', { tag: 'api', sub: ['api.idthw-api'] })
    const zts = auth(d, 769, 58, 410, 166)
    d.edge([client.right(.43), proxy.left(.43)], { label: 'AT · mcp', at: [370, 518], size: 17, token: 'access', tokenAt: [370, 577] })
    d.edge([proxy.right(.43), mcp.left(.43)], { label: 'tools/call', at: [776, 518], size: 17, token: 'access', tokenAt: [776, 577] })
    d.edge([mcp.right(.43), api.left(.43)], { label: 'AT · api', at: [1172, 518], size: 17, token: 'exchanged', tokenAt: [1172, 577] })
    d.edge([mcp.top(.25), [904, zts.y + zts.h]], { label: 'Exchange AT', at: [792, 331], token: 'access' })
    d.edge([[1044, zts.y + zts.h], mcp.top(.75)], { tone: 'green', dash: true, label: 'AT · aud=api', at: [1144, 354], token: 'exchanged' })
    docs(d, api, client, 708)
    save('11_protected_mcp', d)
  }

  {
    const d = new Architecture(1160, 410, 'MCP Runtime Proxy rejects a token for the API audience')
    const client = d.card('client', 64, 103, 282, 208, 'Claude Code', { tag: 'api', sub: ['aud=api'] })
    const proxy = d.card('proxy', 814, 103, 282, 208, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    d.edge([client.right(.31), proxy.left(.31)], { label: 'tools/call', at: [580, 139], token: 'access', tokenAt: [580, 196] })
    d.edge([proxy.left(.7), client.right(.7)], { tone: 'red', dash: true, label: '401 Unauthorized', secondary: 'Wrong audience', at: [580, 290] })
    save('11_mcp_rejected', d)
  }

  {
    const d = new Architecture(1120, 340, 'Athenz does not yet trust Keycloak')
    const idp = d.card('idp', 64, 86, 280, 168, 'Keycloak')
    const zts = d.card('zts', 776, 86, 280, 168, 'Athenz ZTS')
    d.edge([zts.left(), idp.right()], { tone: 'red', dash: true, label: 'Not trusted', at: [560, 140], size: 20 })
    save('12_idp_untrusted', d)
  }

  {
    const d = new Architecture(1040, 355, 'Keycloak token exchange provider installed in ZTS')
    d.frame(56, 42, 928, 265, 'ATHENZ ZTS')
    d.card('plugin', 210, 111, 620, 144, 'KeycloakTokenExchangeProvider', { compact: true, sub: ['keycloak-token-provider.jar'] })
    save('13_provider_installed', d)
  }

  {
    const d = new Architecture(1480, 484, 'Keycloak token verification in Athenz ZTS')
    const idp = d.card('idp', 56, 158, 282, 180, 'Keycloak')
    d.frame(720, 57, 704, 370, 'ATHENZ ZTS')
    const plugin = d.card('plugin', 750, 142, 332, 221, ['Keycloak token', 'exchange provider'], { sub: ['human.idjag-learner'] })
    const file = d.card('file', 1172, 165, 224, 178, 'providers.json')
    d.edge([[plugin.x, 248], idp.right()], { tone: 'gray', dash: true, label: 'Verify with JWKS', at: [544, 211] })
    d.edge([[file.x, 248], [plugin.x + plugin.w, 248]], { tone: 'gray', label: 'Config', at: [1127, 212], size: 16 })
    save('13_provider_trust', d)
  }

  {
    const d = new Architecture(1490, 700, 'Configured Claude gateway and protected MCP route')
    const idp = d.card('idp', 425, 64, 282, 168, 'Keycloak')
    const zts = auth(d, 1040, 64, 394, 168)
    const client = d.card('client', 56, 443, 260, 196, 'Claude Code')
    const gateway = d.card('gateway', 414, 443, 304, 196, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    const proxy = d.card('proxy', 826, 443, 266, 196, ['MCP Runtime', 'Proxy'])
    const mcp = d.card('mcp', 1194, 443, 240, 196, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    d.edge([gateway.top(), idp.bottom()], { tone: 'gray', dash: true, label: 'OIDC', at: [495, 335] })
    d.edge([[646, gateway.y], [941, 148], zts.left()], { tone: 'gray', dash: true, label: 'Token exchange', at: [894, 313] })
    d.edge([client.right(.43), gateway.left(.43)], { label: 'MCP', at: [365, 497], size: 17 })
    d.edge([gateway.right(.43), proxy.left(.43)], { label: 'Upstream', at: [772, 497], size: 17 })
    d.edge([proxy.right(.43), mcp.left(.43)], { label: 'MCP', at: [1143, 497], size: 17 })
    save('14_gateway_route', d)
  }

  {
    const d = new Architecture(1420, 700, 'Sign-in succeeds before ID-JAG delegation is denied')
    const human = d.card('human', 56, 58, 264, 164, 'Human')
    const idp = d.card('idp', 440, 58, 304, 164, 'Keycloak')
    const client = d.card('client', 56, 432, 264, 202, 'Claude Code')
    const gateway = d.card('gateway', 440, 432, 304, 202, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    const zts = d.card('zts', 1056, 432, 308, 202, 'Athenz ZTS')
    d.edge([human.right(.44), idp.left(.44)], { label: 'Login', at: [380, 104] })
    d.edge([human.bottom(), client.top()], { label: 'Prompt', at: [188, 329] })
    d.edge([idp.bottom(), gateway.top()], { tone: 'green', dash: true, label: 'ID token', at: [671, 327] })
    d.edge([client.right(.4), gateway.left(.4)], { label: 'MCP', at: [380, 481] })
    d.edge([gateway.right(.4), zts.left(.4)], { label: 'ID token → ID-JAG', at: [900, 490] })
    d.edge([zts.left(.74), gateway.right(.74)], { tone: 'red', dash: true, label: 'Permission denied', secondary: 'zts.jag_exchange', at: [900, 622] })
    save('14_idjag_denied', d)
  }

  {
    const d = new Architecture(1740, 815, 'Core tutorial: signed-in Claude user retrieves API documents', 'Keycloak authenticates the human. AI Client Gateway exchanges the ID token for ID-JAG and then an MCP-audience access token at ZTS. MCP Runtime Proxy validates MCP access. The MCP adapter exchanges the token for an API-audience docs-getter token. The API validates the token and returns documents.')
    const human = d.card('human', 48, 64, 232, 180, 'Human', { sub: ['human.idjag-learner'] })
    const idp = d.card('idp', 380, 64, 300, 180, 'Keycloak')
    const zts = d.card('zts', 1048, 45, 644, 199, 'Athenz ZTS', { compact: true, sub: ['KeycloakTokenExchangeProvider'] })
    d.frame(756, 441, 644, 269, 'MCP DEPLOYMENT')
    const client = d.card('client', 48, 496, 232, 190, 'Claude Code')
    const gateway = d.card('gateway', 380, 496, 300, 190, ['AI Client', 'Gateway'], { sub: ['human.idjag-learner.claude'] })
    const proxy = d.card('proxy', 780, 496, 264, 190, ['MCP Runtime', 'Proxy'], { tag: 'mcp' })
    const mcp = d.card('mcp', 1144, 496, 232, 190, 'MCP server', { sub: ['mcp.idthw-api-mcp'] })
    const api = d.card('api', 1476, 496, 216, 190, 'API server', { tag: 'api', sub: ['api.idthw-api'] })
    d.edge([human.right(.42), idp.left(.42)], { label: 'Login', at: [330, 111], size: 17 })
    d.edge([human.bottom(), client.top()], { label: 'Prompt', at: [162, 380] })
    d.edge([idp.bottom(.25), gateway.top(.25)], { tone: 'green', dash: true, label: 'ID token', at: [387, 385] })
    d.edge([[zts.x, idp.right(.42)[1]], idp.right(.42)], { tone: 'gray', dash: true, label: 'JWKS', at: [864, 112] })
    d.edge([gateway.top(.45), [515, 294], [1080, 294], [1080, zts.y + zts.h]], { label: 'ID token → ID-JAG → AT', at: [786, 274] })
    d.edge([[1120, zts.y + zts.h], [1120, 392], [641, 392], gateway.top(.87)], { tone: 'green', dash: true, label: 'AT · aud=mcp', at: [874, 372], token: 'access', tokenAt: [1000, 392] })
    d.edge([mcp.top(.25), [1202, zts.y + zts.h]], { label: 'Exchange AT', at: [1202, 303], token: 'access', tokenAt: [1202, 385] })
    d.edge([[1318, zts.y + zts.h], mcp.top(.75)], { tone: 'green', dash: true, label: 'AT · aud=api', at: [1318, 415], token: 'exchanged', tokenAt: [1318, 333] })
    d.edge([client.right(.46), gateway.left(.46)], { label: 'MCP', at: [330, 557], size: 17 })
    d.edge([gateway.right(.46), proxy.left(.46)], { label: 'mcp AT', at: [730, 557], size: 17, token: 'access', tokenAt: [730, 616] })
    d.edge([proxy.right(.46), mcp.left(.46)], { label: 'tools/call', at: [1094, 557], size: 16, token: 'access', tokenAt: [1094, 616] })
    d.edge([mcp.right(.46), api.left(.46)], { label: 'api AT', at: [1426, 557], size: 17, token: 'exchanged', tokenAt: [1426, 616] })
    docs(d, api, client, 755)
    save('15_idjag_flow', d)
  }

  {
    const d = new Architecture(1400, 836, 'Core tutorial delegation permissions')
    const rows = [
      { y: 54, h: 188, kind: 'human', title: 'Human', sub: 'human.idjag-learner', label: 'Member', lines: ['mcp:role.mcp-accessor', 'api:role.docs-getter'] },
      { y: 308, h: 208, kind: 'gateway', title: ['AI Client', 'Gateway'], sub: 'human.idjag-learner.claude', label: 'zts.jag_exchange', lines: ['mcp:role.mcp-accessor', 'api:role.docs-getter'] },
      { y: 582, h: 188, kind: 'mcp', title: 'MCP server', sub: 'mcp.idthw-api-mcp', label: 'Exchange', lines: ['zts.token_source_exchange · mcp:api', 'zts.token_target_exchange', 'api:mcp:role.docs-getter'] }
    ]
    for (const row of rows) {
      const service = d.card(row.kind, 56, row.y, 330, row.h, row.title, { sub: [row.sub] })
      d.nodes.push(`<rect x="774" y="${row.y}" width="570" height="${row.h}" rx="18" fill="#F7F6FB" stroke="#E5E0EE" stroke-width="1.2"/>`)
      row.lines.forEach((line, i) => d.nodes.push(d.text(802, row.y + 63 + i * 37, line, { size: 18, mono: true, color: '#5C5575' })))
      d.edge([service.right(.45), [774, row.y + row.h * .45]], { tone: 'purple', label: row.label, at: [580, row.y + row.h * .45 - 29] })
    }
    save('permissions', d)
  }
}
