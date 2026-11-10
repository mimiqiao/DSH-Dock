/** Pure, replayable session fold. No process-global pending calls or filesystem reads. */
export const CATEGORIES = [
  ['presentation', '投影幕', '演示与幻灯片'], ['app', '电脑', '网页与应用'],
  ['image', '相册', '图片与设计'], ['video', '放映机', '视频与动画'],
  ['audio', '音箱', '音乐与声音'], ['document', '书架', '文章与文档'],
  ['data', '资料夹', '表格与数据'], ['code', '工具箱', '代码与工程'],
  ['discussion', '笔记本', '讨论与想法'], ['other', '收纳盒', '其他文件'],
]
export function textOf(content) {
  return Array.isArray(content) ? content.filter(b => b?.type === 'text').map(b => b.text || '').join('\n') : ''
}
export function topicOf(text = '') {
  const rules = [['编程', /代码|编程|修复|bug|开发|debug|implement/i], ['数据分析', /数据|分析表|统计|报表|csv|excel/i], ['设计创作', /设计|图片|海报|视频|音乐|配音|动画/i], ['研究', /调研|研究|搜索|调查|research/i], ['写作', /写作|文章|文案|报告|演讲|ppt|幻灯片|演示/i]]
  return rules.find(([, re]) => re.test(text))?.[0] || '日常讨论'
}
export function classify(path = '', body = '', mediaType = '', context = '') {
  const ext = path.split(/[?#]/)[0].split('.').pop().toLowerCase()
  if (/^(pptx?|key|odp)$/.test(ext)) return 'presentation'
  if (/^(html?|xhtml)$/.test(ext)) return /reveal\b|slide[s-]?\b|幻灯片|演示稿|ppt|presentation/i.test(path + '\n' + body + '\n' + context) ? 'presentation' : 'app'
  if (mediaType.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(ext)) return 'image'
  if (mediaType.startsWith('video/') || /^(mp4|webm|mov|mkv|avi)$/.test(ext)) return 'video'
  if (mediaType.startsWith('audio/') || /^(mp3|wav|ogg|m4a|flac|aac)$/.test(ext)) return 'audio'
  if (/^(csv|tsv|xlsx?|ods|json|parquet|sqlite|db)$/.test(ext)) return 'data'
  if (/^(md|mdx|txt|pdf|docx?|odt|rtf|epub)$/.test(ext)) return 'document'
  if (/^(js|jsx|ts|tsx|py|go|rs|java|css|scss|c|cpp|h|sh|sql|yaml|yml|vue|svelte|ipynb|toml)$/.test(ext)) return 'code'
  return 'other'
}
export function initialState(header) {
  return { cwd: typeof header?.cwd === 'string' ? header.cwd : '', items: [], pending: {}, running: false, status: 'idle', turns: 0, toolCalls: 0, lastActivity: 0, topic: '日常讨论', request: '', summary: '' }
}
function normalizePath(path) {
  if (typeof path !== 'string' || /[\u0000-\u001f]/.test(path)) return undefined
  const slash = path.replace(/\\/g, '/')
  const parts = []
  for (const part of slash.split('/')) {
    if (!part || part === '.') continue
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop()
    else parts.push(part)
  }
  return (slash.startsWith('/') ? '/' : '') + parts.join('/')
}
function put(state, candidate, event) {
  const inputPath = candidate.path
  const path = normalizePath(typeof inputPath === 'string' && !/^(?:\/|[A-Za-z]:[/\\])/.test(inputPath) && state.cwd ? state.cwd + '/' + inputPath : inputPath)
  const matches = state.items.filter(i => path && i.path === path || candidate.previousPaths?.includes(i.path) || candidate.attachmentId && i.attachmentId === candidate.attachmentId || candidate.id && i.id === candidate.id)
  const old = matches[0]
  const defined = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined))
  const merged = { ...old, ...defined }
  if (candidate.invalidateAttachment) {
    for (const key of ['attachmentId','attachmentName','mediaType','width','height','bytes']) delete merged[key]
  }
  delete merged.invalidateAttachment
  const id = path ? `file:${path}` : merged.attachmentId ? `attachment:${merged.attachmentId}` : candidate.id
  if (!id) return state
  const kind = candidate.kind || classify(path || merged.title, merged.body, merged.mediaType || '', state.request)
  const originalName = candidate.title || path?.split('/').pop() || old?.title
  const opaque = !originalName || /^(?:sha256:)?[a-f0-9]{32,}$/i.test(originalName)
  const title = opaque ? kind === 'image' ? `图片${merged.width && merged.height ? ` · ${merged.width} × ${merged.height}` : ''}` : '未命名作品' : originalName
  const item = { ...merged, ...(path ? { path } : {}), id, kind, title,
    topic: state.topic, seq: event.seq, time: event.time, revisions: old ? old.revisions + (old.seq !== event.seq ? 1 : 0) : 1,
    firstTime: old?.firstTime || old?.time || event.time,
    firstSeq: matches.length ? Math.min(...matches.map(i=>i.firstSeq)) : event.seq }
  return { ...state, items: [item, ...state.items.filter(i => !matches.includes(i))], lastActivity: event.time }
}
function parse(value) { try { return typeof value === 'string' ? JSON.parse(value) : value || {} } catch { return {} } }
function filesFromResult(message) {
  const values = []
  const structured = message?.structuredContent
  if (structured && typeof structured === 'object') values.push(structured)
  for (const b of message?.content || []) {
    if (b.type === 'text') { const obj = parse(b.text); if (obj && typeof obj === 'object') values.push(obj) }
  }
  return values.flatMap(v => Array.isArray(v.files) ? v.files : v.path ? [v] : [])
}
export function fold(state, event) {
  const d = event.data || {}
  switch (event.type) {
    case 'user/message': {
      const request = textOf(d.content || d.message?.content).slice(0, 2000)
      return { ...state, request, topic: topicOf(request), status: state.running ? 'running' : 'idle', lastActivity: event.time }
    }
    case 'turn/start': return { ...state, running: true, status: 'running', turns: state.turns + 1, lastActivity: event.time }
    case 'turn/end': {
      const reason = d.reason?.kind || d.reason || d.status || d.outcome
      const status = /error|failed|blocked/.test(String(reason)) ? 'problem' : /question|waiting|input/.test(String(reason)) ? 'attention' : 'ready'
      return { ...state, running: false, status, pending: {}, lastActivity: event.time }
    }
    case 'tool/call': {
      const args = parse(d.arguments)
      // Keep only identity/preview metadata, never arbitrary tool arguments or commands.
      const record = { name: d.name, path: args.file_path || args.path, body: typeof args.content === 'string' ? args.content.slice(0, 1600) : undefined, files: args.files, patch: typeof args.input === 'string' ? args.input.slice(0, 100000) : undefined }
      return { ...state, pending: { ...state.pending, [d.callId]: record }, toolCalls: state.toolCalls + 1, lastActivity: event.time }
    }
    case 'tool/result': {
      const message = d.message || {}
      const callId = message.toolCallId || message.source?.callId
      const call = state.pending[callId]
      const pending = { ...state.pending }; delete pending[callId]
      let next = { ...state, pending, lastActivity: event.time }
      if (message.isError || d.isError) return next
      for (const b of message.content || []) {
        if ((b.type === 'image' || b.type === 'file') && b.attachment) {
          const a = b.attachment
          next = put(next, { title: a.name, attachmentName: a.name, ...(call?.name === 'read_image' ? { path: d.meta?.path || call.path } : {}), attachmentId: a.attachmentId, mediaType: a.mediaType, width: a.width, height: a.height, bytes: a.bytes, ...(b.type === 'image' ? { kind: 'image' } : {}) }, event)
        }
      }
      const files = ['read', 'read_image'].includes(call?.name) ? [] : typeof d.meta?.path === 'string' ? [{ path: d.meta.path }] : filesFromResult(message)
      if (call && ['write', 'edit', 'apply_patch', 'present'].includes(call.name)) {
        const completed = call.name === 'apply_patch' ? [...textOf(message.content).matchAll(/^([AMD]) (.+)$/gm)] : []
        // Patch output lists only observed completed operations; requested paths can fail/skip.
        if (call.name === 'apply_patch') {
          for (const m of completed.filter(m => m[1] === 'D')) {
            const deleted = normalizePath(m[2].startsWith('/') ? m[2] : state.cwd ? state.cwd + '/' + m[2] : m[2])
            next = { ...next, items: next.items.filter(i => i.path !== deleted) }
          }
        }
        const paths = call.name === 'apply_patch' ? completed.filter(m => m[1] !== 'D').map(m => ({ path: m[2] })) : files.length ? files : call.path ? [{ path: call.path }] : call.files || []
        for (const f of paths) {
          const resolve=p=>normalizePath(p.startsWith('/')||/^[A-Za-z]:/.test(p)?p:state.cwd?state.cwd+'/'+p:p)
          const move=call.name==='apply_patch'?[...(call.patch||'').matchAll(/^\*\*\* Update File: ([^\n]+)\n\*\*\* Move to: ([^\n]+)/gm)].find(m=>resolve(m[2])===resolve(f.path)):null
          const old=move?next.items.find(i=>i.path===resolve(move[1])):null
          next = put(next, { path: f.path, description: f.description, ...(move?{previousPaths:[...new Set([resolve(move[1]),...(old?.previousPaths||[])])]}:{}), ...(['write','edit','apply_patch'].includes(call.name) ? { invalidateAttachment: true } : {}), ...(call.body !== undefined ? { body: call.body } : {}) }, event)
        }
      } else {
        // Structured result files from generation tools, without guessing from arbitrary prose.
        for (const f of files) next = put(next, { path: f.path, description: f.description }, event)
      }
      return next
    }
    case 'deliverables/presented': {
      let next = state
      for (const f of d.files || []) next = put(next, { path: f.path, description: f.description, delivered: true }, event)
      return next
    }
    case 'assistant/message': {
      const body = textOf(d.message?.content).trim()
      if (!body) return state
      let next = { ...state, summary: body.slice(0, 2400), lastActivity: event.time }
      // Shell-generated works are often delivered as explicit local Markdown links.
      // Only file-shaped local targets are collected, never arbitrary research URLs.
      for (const match of body.matchAll(/!?\[([^\]\n]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
        let path = (match[2] || match[3] || '').replace(/^file:\/\//, '').replace(/:\d+(?::\d+)?$/, '')
        try { path = decodeURIComponent(path) } catch { continue }
        if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[A-Za-z]:[/\\]/.test(path)) continue
        if (!/\.[a-z0-9]{1,10}$/i.test(path) || !/[/\\]/.test(path) && !state.cwd) continue
        next = put(next, { path, description: match[1] || undefined, referenced: true }, event)
      }
      // One discussion entry per session. Files remain separate related works.
      return put(next, { id: 'discussion', kind: 'discussion', title: (state.request || body).split('\n').find(Boolean)?.slice(0, 80) || '讨论', body: body.slice(0, 2400) }, event)
    }
    default: return state
  }
}
export function viewOf(state) {
  const { pending, ...view } = state
  return { ...view, produced: state.items.length }
}
export function collectDesks(bySession = {}, list = {}) {
  return [...new Set([...Object.keys(bySession),...Object.keys(list)])].flatMap(sessionId => {
    const snapshot = bySession[sessionId]
    const desk = snapshot?.values?.desk
    if (!desk || !Array.isArray(desk.items)) {
      const row=list[sessionId]
      if(!row || row.blank)return []
      const title=row.title || row.displayTitle || sessionId
      return [{sessionId,title,unindexed:true,status:row.running?'running':'unavailable',running:!!row.running,topic:'待整理',lastActivity:row.updatedAt||0,items:[{id:'unindexed-session',kind:'discussion',title,body:'此会话的工作内容尚未完成整理。历史格式可能需要升级，或读取暂时失败；可回原会话查看。',topic:'待整理',seq:0,firstSeq:0,revisions:1,time:row.updatedAt||0}]}]
    }
    const status = snapshot.values.userQuestions?.active?.length ? 'attention' : desk.status
    return [{ ...desk, status, sessionId, title: snapshot.values.title || list[sessionId]?.title || sessionId }]
  }).sort((a, b) => b.lastActivity - a.lastActivity)
}
