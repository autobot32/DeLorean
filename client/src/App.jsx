import { useEffect, useRef, useState } from 'react'

function App() {
  // Local-only state for previewing memories
  const LS_KEY = 'delorean_assets_v1'
  const [memories, setMemories] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
      if (Array.isArray(cached) && cached.length) {
        return [
          // server-backed assets restored from cache
          ...cached.map(a => ({ id: a.id || a.filename || a.url, title: a.title || '', meta: a.meta || '', url: a.url })),
          // placeholders for empty spots
          ...sampleMemories(),
        ]
      }
    } catch {}
    return sampleMemories()
  })
  const fileInputRef = useRef(null)
  const pendingContextRef = useRef('')
  const [isDropping, setIsDropping] = useState(false)
  const [theme, setTheme] = useState('dark')
  const starCanvasRef = useRef(null)
  const memoriesStarRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [prompts, setPrompts] = useState(() => {
    try{
      const raw = localStorage.getItem('delorean_prompts_v1')
      return raw ? JSON.parse(raw) || {} : {}
    }catch{ return {} }
  })
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [createContextDraft, setCreateContextDraft] = useState('')
  const [storyText, setStoryText] = useState('')
  const API_BASE = (import.meta?.env?.VITE_API_BASE || 'http://localhost:4000').replace(/\/$/,'')

  const ordinalLabel = (n) => {
    const suffixes = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    const suffix = suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]
    return `${n}${suffix}`
  }

  // Lightweight hash routing for three pages
  function parseHash(){
    const h = (window.location.hash || '').toLowerCase()
    if (h.includes('create')) return 'create'
    if (h.includes('memories')) return 'memories'
    return 'welcome'
  }
  const [page, setPage] = useState(parseHash)
  useEffect(() => {
    const onHash = () => setPage(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Theme: load and persist, toggle 'dark' class on <html>
  useEffect(() => {
    const root = document.documentElement
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || (prefersDark ? 'dark' : 'light')
    setTheme(initial)
    root.classList.toggle('dark', initial === 'dark')
  }, [])

  // Reveal-on-scroll for Welcome page sections
  useEffect(() => {
    if (page !== 'welcome') return
    const targets = Array.from(document.querySelectorAll('#welcome .reveal'))
    if (!targets.length) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible')
      })
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' })
    targets.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [page])

  // Starfield specifically behind the Memories section
  useEffect(() => {
    const canvas = memoriesStarRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId
    let width = 0, height = 0, dpr = Math.min(window.devicePixelRatio || 1, 2)
    const STAR_COUNT = 220
    const stars = []

    function resize(){
      // canvas fills its section container
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function initStars(){
      stars.length = 0
      for (let i = 0; i < STAR_COUNT; i++){
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.3 + 0.5,
          tw: Math.random() * Math.PI * 2,
          sp: 0.06 + Math.random() * 0.28,
          dx: -0.15 + Math.random() * 0.3,
        })
      }
    }

    function draw(){
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(255,255,255,0.85)'
      ctx.shadowBlur = 7
      for (const s of stars){
        const a = 0.65 + Math.sin(s.tw) * 0.45
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        s.y -= s.sp
        s.x += s.dx * 0.2
        s.tw += 0.045 + s.sp * 0.02
        if (s.y < -2){ s.y = height + 2; s.x = Math.random() * width }
        if (s.x < -2){ s.x = width + 2 }
        if (s.x > width + 2){ s.x = -2 }
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      rafId = requestAnimationFrame(draw)
    }

    const onResize = () => { resize(); initStars() }
    resize(); initStars(); draw()
    const ro = new ResizeObserver(onResize)
    ro.observe(canvas)
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize); ro.disconnect() }
  }, [])
  // Starfield background (space with white stars)
  useEffect(() => {
    const canvas = starCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId
    let width = 0, height = 0, dpr = Math.min(window.devicePixelRatio || 1, 2)
    const STAR_COUNT = 320
    const stars = []

    function resize(){
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function initStars(){
      stars.length = 0
      for (let i = 0; i < STAR_COUNT; i++){
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.4 + 0.6,
          tw: Math.random() * Math.PI * 2,
          sp: 0.08 + Math.random() * 0.35, // drift speed
          dx: -0.2 + Math.random() * 0.4, // subtle x drift
        })
      }
    }

    function draw(){
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(255,255,255,0.9)'
      ctx.shadowBlur = 8
      for (const s of stars){
        // twinkle
        const a = 0.7 + Math.sin(s.tw) * 0.45
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        // drift diagonally upward for a parallax feel
        s.y -= s.sp
        s.x += s.dx * 0.2
        s.tw += 0.05 + s.sp * 0.02
        if (s.y < -2){ s.y = height + 2; s.x = Math.random() * width }
        if (s.x < -2){ s.x = width + 2 }
        if (s.x > width + 2){ s.x = -2 }
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      rafId = requestAnimationFrame(draw)
    }

    const onResize = () => { resize(); initStars() }
    resize(); initStars(); draw()
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize) }
  }, [])

  // Try to load existing uploads from the server (non-fatal if server is down)
  useEffect(() => {
    let cancelled = false
    async function load(){
      try{
        const res = await fetch(`${API_BASE}/api/uploads`)
        if(!res.ok) throw new Error(`Failed to fetch uploads: ${res.status}`)
        const data = await res.json()
        if(cancelled) return
        if (Array.isArray(data.assets)){
          const items = data.assets.map(a => ({
            id: a.id || a.filename,
            title: a.originalName || a.filename,
            meta: new Date(a.createdAt || Date.now()).toLocaleDateString(),
            url: a.url,
            context: typeof a.context === 'string' ? a.context : ''
          }))
          setMemories(prev => {
            const seen = new Set(items.map(i => i.url))
            const filteredPrev = prev.filter(p => !p.url || !seen.has(p.url))
            return [...items, ...filteredPrev]
          })
          setPrompts(prev => {
            const base = { ...(prev || {}) }
            for (const asset of items){
              if (asset.id && asset.context){
                base[asset.id] = asset.context
              }
            }
            return base
          })
        }
      }catch(err){
        // silently ignore; UI stays usable without server
      }
    }
    load()
    return () => { cancelled = true }
  }, [API_BASE])

  // Persist server-backed assets so they survive refresh even if server is offline
  useEffect(() => {
    try {
      const assets = memories.filter(m => !!m.url).map(m => ({ id: m.id, title: m.title || '', meta: m.meta || '', url: m.url }))
      localStorage.setItem(LS_KEY, JSON.stringify(assets))
    } catch {}
  }, [memories])
  // Persist prompts locally
  useEffect(() => {
    try { localStorage.setItem('delorean_prompts_v1', JSON.stringify(prompts || {})) } catch {}
  }, [prompts])

  function toggleTheme(){
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    const root = document.documentElement
    root.classList.toggle('dark', next === 'dark')
    localStorage.setItem('theme', next)
  }

  // Revoke object URLs on unmount
  useEffect(() => () => {
    memories.forEach(m => m.objectUrl && URL.revokeObjectURL(m.objectUrl))
  }, [])

  function sampleMemories(){
    // Placeholder items with blank text
    const seed = [
      { id: 'm1', title: '', meta: '' },
      { id: 'm2', title: '', meta: '' },
      { id: 'm3', title: '', meta: '' },
      { id: 'm4', title: '', meta: '' },
      { id: 'm5', title: '', meta: '' },
      { id: 'm6', title: '', meta: '' },
    ]
    return seed
  }

  function addFiles(files){
    const next = []
    const tempIds = []
    const newPrompts = {}
    const pendingContext = (pendingContextRef.current || '').trim()
    for (const file of files){
      if (!file.type.startsWith('image/')) continue
      const objectUrl = URL.createObjectURL(file)
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2,7)}`
      tempIds.push(id)
      next.push({ id, title: file.name, meta: new Date(file.lastModified).toLocaleDateString(), objectUrl })
      if (pendingContext) newPrompts[id] = pendingContext
    }
    if (next.length){
      setMemories(prev => [...next, ...prev])
      if (Object.keys(newPrompts).length){
        setPrompts(prev => {
          const base = { ...(prev || {}) }
          for (const [id, value] of Object.entries(newPrompts)){
            base[id] = value
          }
          return base
        })
      }
      pendingContextRef.current = ''
      // Upload then replace temps with server-backed entries
      uploadToServer(files, tempIds, newPrompts)
    }
  }

  function onFileChange(e){
    const files = e.currentTarget.files
    if (files && files.length) addFiles(files)
    // reset input so selecting the same files again will re-trigger
    e.currentTarget.value = ''
  }

  function onDrop(e){
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer?.files
    if (files && files.length) addFiles(files)
    setIsDropping(false)
  }

  function onDragOver(e){
    e.preventDefault()
    setIsDropping(true)
  }

  function onDragLeave(e){
    e.preventDefault()
    setIsDropping(false)
  }

  function removeMemory(id){
    setMemories(prev => {
      const item = prev.find(m => m.id === id)
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl)
      return prev.filter(m => m.id !== id)
    })

    // Attempt to delete from server if this item exists there
    const target = memories.find(m => m.id === id)
    if (target?.id && target?.url) {
      // fire-and-forget; UI updates immediately
      fetch(`${API_BASE}/api/uploads/${encodeURIComponent(target.id)}`, { method: 'DELETE' }).catch(() => {})
    }
    // drop any prompt for this id
    setPrompts(prev => { const next = { ...(prev||{}) }; delete next[id]; return next })
  }

  function clearAll(){
    setMemories(prev => {
      prev.forEach(m => m.objectUrl && URL.revokeObjectURL(m.objectUrl))
      // keep server-backed items, drop local previews, and add placeholders
      const keep = prev.filter(m => !!m.url)
      return [...keep, ...sampleMemories()]
    })
  }

  async function uploadToServer(fileList, tempIds = [], batchPrompts = {}){
    try{
      setUploadError(null)
      setIsUploading(true)
      const form = new FormData()
      let count = 0
      const contexts = []
      let i = 0
      for (const file of fileList){
        if (file.type?.startsWith('image/')){
          form.append('images', file)
          count++
          const tid = tempIds?.[i]
          const basePrompt = tid ? (batchPrompts[tid] ?? prompts[tid] ?? '') : ''
          contexts.push((basePrompt || '').trim())
          i++
        }
      }
      // Attach per-file contexts as an array aligned with images order
      if (contexts.length) form.append('contexts', JSON.stringify(contexts))
      if (count === 0){ setIsUploading(false); return }
      const res = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.assets)){
        const items = data.assets.map(a => ({ id: a.id || a.filename, title: a.originalName || a.filename, meta: new Date(a.createdAt || Date.now()).toLocaleDateString(), url: a.url }))
        setMemories(prev => {
          // Remove temporary previews we created for this batch
          const toRemove = new Set(tempIds)
          prev.filter(m => toRemove.has(m.id) && m.objectUrl).forEach(m => {
            try { URL.revokeObjectURL(m.objectUrl) } catch {}
          })
          const filtered = prev.filter(m => !toRemove.has(m.id))
          // De-duplicate by URL in case something already exists
          const seenUrls = new Set(filtered.map(m => m.url).filter(Boolean))
          const dedupItems = items.filter(it => !seenUrls.has(it.url))
          return [...dedupItems, ...filtered]
        })
      }
    }catch(err){
      setUploadError(err.message || 'Upload failed')
    }finally{
      setIsUploading(false)
    }
  }

  async function analyzeAll(){
    try{
      setAnalyzeError(null)
      setIsAnalyzing(true)
      const items = memories
        .filter(m => m.id && prompts[m.id] && prompts[m.id].trim())
        .map(m => ({ id: m.id, context: prompts[m.id].trim() }))
      if (!items.length){ setIsAnalyzing(false); return }
      // Use /api/story to process contexts
      const res = await fetch(`${API_BASE}/api/story`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memories: items })
      })
      if (!res.ok) throw new Error(`Analyze failed: ${res.status}`)
      const data = await res.json()
      setStoryText(typeof data.story === 'string' ? data.story : '')
    }catch(err){
      setAnalyzeError(err.message || 'Analyze failed')
    }finally{
      setIsAnalyzing(false)
    }
  }

<<<<<<< HEAD
  return (
=======
  async function narrateAll(){
    try{
      setAnalyzeError(null)
      setIsNarrating(true)
      const items = memories
        .filter(m => m.id && (prompts[m.id]?.trim() || storyText?.trim()))
        .map(m => ({ id: m.id, context: (prompts[m.id] || '').trim() }))
      const res = await fetch(`${API_BASE}/api/narrate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memories: items })
      })
      if (!res.ok) throw new Error(`Narrate failed: ${res.status}`)
      const data = await res.json()
      if (typeof data.story === 'string') setStoryText(data.story)
      if (typeof data.audio === 'string') setStoryAudio(`${API_BASE}${data.audio}`)
    }catch(err){
      setAnalyzeError(err.message || 'Narration failed')
    }finally{
      setIsNarrating(false)
    }
  }

  const mainView = (
>>>>>>> 3822bfe (ThreeJS scene is ready)
    <main className="relative min-h-dvh w-full">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Animated ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* Starfield layer */}
        <canvas ref={starCanvasRef} className="absolute inset-0 h-full w-full"></canvas>
        <div className="animate-gradient-slow absolute -top-40 left-1/2 h-[55vh] w-[90vw] -translate-x-1/2 rounded-full opacity-40 blur-3xl bg-[linear-gradient(90deg,#00EAFF,45%,#FF3EC9,65%,#8A5CF6)] bg-[length:200%_200%]"></div>
        <div className="animate-float absolute bottom-[-8rem] left-[-8rem] h-[40vh] w-[40vh] rounded-full opacity-30 blur-3xl bg-[radial-gradient(circle_at_30%_30%,#8A5CF6,transparent_60%)]"></div>
        <div className="animate-float absolute right-[-6rem] top-[20%] h-[36vh] w-[36vh] rounded-full opacity-25 blur-3xl bg-[radial-gradient(circle_at_70%_70%,#00EAFF,transparent_60%)]"></div>
      </div>
      {/* Header */}
      <div className="sticky top-3 z-10">
        <div className="mx-auto max-w-6xl px-2">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-neon-pink to-neon-violet">DeLorean</div>
            <div className="flex items-center gap-2">
              <nav className="hidden sm:flex items-center gap-3 text-slate-600 dark:text-slate-400" aria-label="Primary">
                <a href="#/welcome" className={(page==='welcome'?'text-slate-900 dark:text-slate-100 ': '') + 'rounded-md px-2 py-1 hover:text-slate-900 dark:hover:text-slate-100'}>Welcome</a>
                <a href="#/create" className={(page==='create'?'text-slate-900 dark:text-slate-100 ': '') + 'rounded-md px-2 py-1 hover:text-slate-900 dark:hover:text-slate-100'}>Create New Pathway</a>
                <a href="#/memories" className={(page==='memories'?'text-slate-900 dark:text-slate-100 ': '') + 'rounded-md px-2 py-1 hover:text-slate-900 dark:hover:text-slate-100'}>Memories</a>
              </nav>
              <button
                onClick={() => setShowSandbox(true)}
                className="hidden sm:inline-flex items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-100/70 px-3 py-2 text-sm font-semibold text-cyan-900 hover:ring-2 hover:ring-cyan-300/40 dark:border-cyan-400/30 dark:bg-cyan-900/30 dark:text-cyan-100"
              >
                View Sandbox
              </button>
              <button onClick={toggleTheme} className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" aria-label="Toggle theme">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={onFileChange} />

      {/* Welcome Page with arrows and CTA */}
      {page === 'welcome' && (
        <section id="welcome" className="relative px-6 py-20 text-center space-y-16">
          {/* Big DeLorean title without a box */}
          <h1 className="reveal m-0 text-8xl sm:text-9xl font-extrabold leading-tight tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-neon-pink to-neon-violet">DeLorean</h1>

          {/* Down arrow to Step Back Through Time */}
          <div className="reveal delay-200 mt-12 flex justify-center">
            <ArrowDown />
          </div>

          {/* Step Back Through Time section (no extra buttons) */}
          <div id="step" className="reveal delay-300 mt-10 min-h-[60vh] flex flex-col items-center justify-center space-y-4">
            <h2 className="m-0 text-4xl sm:text-5xl font-bold">Step Back Through Time</h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-700 dark:text-slate-300">Build a pathway of your memories from the past to present.</p>
          </div>

          {/* Arrow to How It Works */}
          <div className="reveal delay-400 mt-14 flex justify-center">
            <ArrowDown />
          </div>

          {/* How It Works content inline on the welcome page */}
          <div id="how" className="reveal delay-500 mt-10 min-h-[70vh] rounded-2xl border border-slate-200/80 bg-white/80 p-8 text-left backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/50">
            <h3 className="mb-4 text-3xl sm:text-4xl font-semibold text-center">How It Works</h3>
            <ol className="grid gap-3 md:grid-cols-3" aria-label="How DeLorean works">
              <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
                <StepIcon number={1} />
                <div>
                  <h4 className="m-0 text-base font-semibold">Collect</h4>
                  <p className="m-0 text-sm text-slate-600 dark:text-slate-400">Choose photos that mark meaningful moments — trips, celebrations, everyday snapshots.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
                <StepIcon number={2} />
                <div>
                  <h4 className="m-0 text-base font-semibold">Arrange</h4>
                  <p className="m-0 text-sm text-slate-600 dark:text-slate-400">We prepare a flowing pathway that spans your past to present.</p>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
                <StepIcon number={3} />
                <div>
                  <h4 className="m-0 text-base font-semibold">Experience</h4>
                  <p className="m-0 text-sm text-slate-600 dark:text-slate-400">Glide through your memories with ambient motion, light, and narration.</p>
                </div>
              </li>
            </ol>

            
          </div>

          {/* Arrow to CTA */}
          <div className="reveal delay-400 mt-14 flex justify-center">
            <ArrowDown />
          </div>

          {/* Bottom CTA to Create page */}
          <div id="cta" className="reveal delay-700 mt-12 mb-24 min-h-[40vh] flex items-center justify-center">
            <a className="animate-glow inline-flex items-center justify-center rounded-lg border border-pink-300/50 bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan px-8 py-3 text-lg font-semibold text-white shadow-lg hover:ring-2 hover:ring-pink-300/40" href="#/create">
              Create Your Pathway
            </a>
          </div>
        </section>
      )}

      {page === 'create' && (
        <section id="create" className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/50">
          <h2 className="mb-3 text-xl font-semibold">Create New Pathway</h2>
          <div className="mb-6 rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-white/90 via-cyan-50/80 to-transparent p-5 text-sm text-slate-700 shadow-sm dark:border-cyan-400/30 dark:bg-gradient-to-br dark:from-slate-900/70 dark:via-cyan-900/40 dark:to-transparent dark:text-cyan-100">
            <h3 className="mb-2 text-base font-semibold text-cyan-800 dark:text-cyan-100">How to craft a great pathway</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Upload your photos together</strong> so this pathway feels cohesive. You can drag &amp; drop or use the button below.</li>
              <li><strong>Add a context summary</strong> before uploading. We’ll attach it to every photo so you can fine-tune details later.</li>
              <li><strong>Review in Memories</strong> once you’re done. Analyze will turn your saved contexts into a narrative you can revisit anytime.</li>
            </ul>
          </div>

          <div className="mb-4 flex flex-col gap-3">
            <div
              className={`grid h-64 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${isDropping ? 'border-pink-400/70 bg-pink-50/60 dark:border-pink-400/70 dark:bg-pink-500/10' : 'border-pink-300/50 bg-white/70 dark:border-pink-400/40 dark:bg-slate-900/40'}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={(e) => {
                pendingContextRef.current = createContextDraft
                onDrop(e)
              }}
            >
              <div className="space-y-2">
                <p className="m-0 text-sm text-slate-600 dark:text-slate-300">Drop photos here or use the button below. All uploads stay on your local server.</p>
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-pink-300/50 bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan px-4 py-2 text-sm font-semibold text-white shadow hover:ring-2 hover:ring-pink-300/40"
                  onClick={() => {
                    pendingContextRef.current = createContextDraft
                    fileInputRef.current?.click()
                  }}
                >
                  Choose Photos
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="create-context">Context for this pathway</label>
              <textarea
                id="create-context"
                rows={4}
                value={createContextDraft}
                onChange={(e) => setCreateContextDraft(e.target.value)}
                placeholder="Describe where, when, who, and why this set of memories matters. We'll prefill new uploads with this context so you can refine in Memories."
                className="w-full rounded-md border border-slate-300/70 bg-white/90 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-300/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a href="#/memories" className="inline-flex items-center justify-center rounded-lg border border-pink-300/50 bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan px-4 py-2 text-white font-semibold shadow hover:ring-2 hover:ring-pink-300/40">View Saved Memories</a>
            <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => { window.location.hash = '#/memories' }}>Go to Memories Workspace</button>
          </div>
        </section>
      )}

      {page === 'memories' && (
      <section id="memories" className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-transparent p-5 dark:border-slate-800/80">
        {/* Starry space background just for this section */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,28,60,0.9),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(8,10,22,0.9),transparent_70%)]" />
          <canvas ref={memoriesStarRef} className="absolute inset-0 h-full w-full"></canvas>
          <div className="absolute inset-0 mix-blend-screen opacity-50" style={{background: 'radial-gradient(1200px 600px at 10% 10%, rgba(255,62,201,0.08), transparent 60%), radial-gradient(800px 400px at 90% 30%, rgba(0,234,255,0.08), transparent 60%)'}} />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Memories Preview</h2>
          <div className="flex gap-2">
            <button
              disabled={isAnalyzing || !memories.some(m => prompts[m.id]?.trim())}
              onClick={analyzeAll}
              className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm ${isAnalyzing ? 'opacity-70 cursor-wait' : ''} border-pink-300/40 bg-gradient-to-r from-neon-pink to-neon-violet text-white hover:ring-2 hover:ring-pink-300/30`}
              title="Analyze context prompts"
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze'}
            </button>
            <button className="inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-100/60 px-3 py-2 text-sm font-semibold text-cyan-900 hover:ring-2 hover:ring-cyan-400/30 dark:border-cyan-400/30 dark:bg-cyan-900/20 dark:text-cyan-200" onClick={clearAll}>Reset</button>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Saved pathways appear here. Click a memory to review its details, update the context, or generate a new story.</p>
        {(analyzeError || storyText) && (
          <div className="mb-4 rounded-xl border border-slate-200/70 bg-white/80 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/50">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-base font-semibold">Generated Story</h3>
              <button className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600" onClick={() => { setStoryText(''); setAnalyzeError(null); }}>Clear</button>
            </div>
            {analyzeError && (
              <div className="mb-2 rounded-md border border-pink-400/40 bg-pink-500/10 px-2 py-1 text-xs text-pink-100">{analyzeError}</div>
            )}
            {storyText && (
              <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{storyText}</div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((m, index) => (
            <article key={m.id} className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/5 shadow-sm backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/20">
              <div className="relative aspect-[16/10] grid place-items-center bg-black/20 dark:bg-black/30" aria-label={m.title} role="img">
                {m.objectUrl || m.url ? (
                  <>
                    <img className="h-full w-full object-cover" src={m.url || m.objectUrl} alt={m.title} />
                  </>
                ) : (
                  <>
                    <div className="h-[76%] w-[92%] rounded-lg border border-dashed border-pink-300/50 bg-gradient-to-br from-white/10 to-white/5 dark:border-slate-600 dark:from-white/10 dark:to-transparent" aria-hidden="true" />
                  </>
                )}
                <button className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-pink-300/60 bg-white/95 text-slate-900 hover:bg-white dark:border-pink-500 dark:bg-slate-900/80 dark:text-slate-100" onClick={() => removeMemory(m.id)} title="Remove">×</button>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <h4 className="m-0 max-w-[70%] truncate text-sm font-semibold" title={m.title}>{m.title}</h4>
                {m.meta && <span className="text-xs text-slate-500 dark:text-slate-400">{m.meta}</span>}
              </div>
              <div className="px-3 pb-3">
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  {`${ordinalLabel(index + 1)} Pathway Experience`}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      )}

      
      </div>
    </main>
  )

  return mainView
}

export default App

function StepIcon({ number }){
  return (
    <span
      className="inline-grid h-7 min-w-7 place-items-center rounded-full border border-pink-300 bg-pink-100 px-2 text-sm font-bold text-pink-700 dark:border-pink-500 dark:bg-[#2a0a1f] dark:text-pink-300"
      aria-hidden
    >
      {number}
    </span>
  )
}

function ArrowDown(){
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 4v14" stroke="#9bd7ff" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M7.5 13.5 12 18l4.5-4.5" stroke="#79e9ff" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  )
}
