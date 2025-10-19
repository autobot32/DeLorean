import { useEffect, useRef, useState } from 'react'

function App() {
  // Local-only state for previewing memories
  const [memories, setMemories] = useState(() => sampleMemories())
  const fileInputRef = useRef(null)
  const [isDropping, setIsDropping] = useState(false)
  const [theme, setTheme] = useState('dark')
  const starCanvasRef = useRef(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const API_BASE = (import.meta?.env?.VITE_API_BASE || 'http://localhost:4000').replace(/\/$/,'')

  // Theme: load and persist, toggle 'dark' class on <html>
  useEffect(() => {
    const root = document.documentElement
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || (prefersDark ? 'dark' : 'light')
    setTheme(initial)
    root.classList.toggle('dark', initial === 'dark')
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
          const items = data.assets.map(a => ({ id: a.id || a.filename, title: a.originalName || a.filename, meta: new Date(a.createdAt || Date.now()).toLocaleDateString(), url: a.url }))
          // Merge with any existing local previews (do not duplicate by url)
          setMemories(prev => {
            const seen = new Set(items.map(i => i.url))
            const filteredPrev = prev.filter(p => !p.url || !seen.has(p.url))
            return [...items, ...filteredPrev]
          })
        }
      }catch(err){
        // silently ignore; UI stays usable without server
      }
    }
    load()
    return () => { cancelled = true }
  }, [API_BASE])

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
    // Placeholder items (no images yet) to demonstrate the grid
    const seed = [
      { id: 'm1', title: 'Graduation Day', meta: 'Jun 12, 2022' },
      { id: 'm2', title: 'Road Trip West', meta: 'Aug 3, 2021' },
      { id: 'm3', title: 'First Hackathon', meta: 'Oct 2020' },
      { id: 'm4', title: 'Sunrise Hike', meta: 'May 2019' },
      { id: 'm5', title: 'Family Reunion', meta: 'Dec 2019' },
      { id: 'm6', title: 'City Lights', meta: 'Nov 2018' },
    ]
    return seed
  }

  function addFiles(files){
    const next = []
    for (const file of files){
      if (!file.type.startsWith('image/')) continue
      const objectUrl = URL.createObjectURL(file)
      next.push({ id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2,7)}`, title: file.name, meta: new Date(file.lastModified).toLocaleDateString(), objectUrl })
    }
    if (next.length){
      setMemories(prev => [...next, ...prev])
      // Fire and forget upload to server
      uploadToServer(files)
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
  }

  function clearAll(){
    setMemories(prev => {
      prev.forEach(m => m.objectUrl && URL.revokeObjectURL(m.objectUrl))
      return sampleMemories()
    })
  }

  async function uploadToServer(fileList){
    try{
      setUploadError(null)
      setIsUploading(true)
      const form = new FormData()
      let count = 0
      for (const file of fileList){
        if (file.type?.startsWith('image/')){
          form.append('images', file)
          count++
        }
      }
      if (count === 0){ setIsUploading(false); return }
      const res = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.assets)){
        const items = data.assets.map(a => ({ id: a.id || a.filename, title: a.originalName || a.filename, meta: new Date(a.createdAt || Date.now()).toLocaleDateString(), url: a.url }))
        setMemories(prev => [...items, ...prev])
      }
    }catch(err){
      setUploadError(err.message || 'Upload failed')
    }finally{
      setIsUploading(false)
    }
  }

  return (
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
              <nav className="hidden sm:flex items-center gap-4 text-slate-500 dark:text-slate-400" aria-label="Primary">
                <a className="hover:text-slate-900 dark:hover:text-slate-100" href="#how">How It Works</a>
                <a className="hover:text-slate-900 dark:hover:text-slate-100" href="#memories">Memories</a>
                <a className="hover:text-slate-900 dark:hover:text-slate-100" href="#upload">Upload</a>
              </nav>
              <button onClick={toggleTheme} className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" aria-label="Toggle theme">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section id="about" className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-[#fde9ff] to-transparent px-6 py-8 dark:border-slate-800/80 dark:from-[#0f1d3a]">
        <h1 className="m-0 text-3xl sm:text-4xl font-bold">Step Back Through Time</h1>
        <p className="mt-2 max-w-2xl text-slate-700 dark:text-slate-300">Build a tunnel of your memories. Preview them here, then upload more to grow your story.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className="animate-glow inline-flex items-center justify-center rounded-lg border border-pink-300/50 bg-gradient-to-r from-neon-pink via-neon-violet to-neon-cyan px-4 py-2 font-semibold text-white shadow-lg hover:ring-2 hover:ring-pink-300/40" href="#upload">Upload Photos</a>
          <a className="inline-flex items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-100/60 px-4 py-2 text-cyan-900 hover:ring-2 hover:ring-cyan-400/30 dark:border-cyan-400/30 dark:bg-cyan-900/20 dark:text-cyan-200" href="#how">How it works</a>
        </div>
      </section>

      <section id="how" className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/50">
        <h2 className="mb-2 text-lg font-semibold">How It Works</h2>
        <ol className="grid gap-3 md:grid-cols-3" aria-label="How DeLorean works">
          <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
            <StepIcon number={1} />
            <div>
              <h3 className="m-0 text-base font-semibold">Collect</h3>
              <p className="m-0 text-sm text-slate-600 dark:text-slate-400">Choose photos that mark meaningful moments — trips, celebrations, or everyday snapshots.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
            <StepIcon number={2} />
            <div>
              <h3 className="m-0 text-base font-semibold">Arrange</h3>
              <p className="m-0 text-sm text-slate-600 dark:text-slate-400">DeLorean maps them along a timeline, preparing an immersive tunnel of your past.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-pink-300/30 bg-white/80 p-3 dark:border-pink-400/20 dark:bg-slate-900/70">
            <StepIcon number={3} />
            <div>
              <h3 className="m-0 text-base font-semibold">Experience</h3>
              <p className="m-0 text-sm text-slate-600 dark:text-slate-400">Glide through your memories as visuals and context surround you in motion.</p>
            </div>
          </li>
        </ol>
      </section>

      <section id="memories" className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/60">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Memories Preview</h2>
          <div className="flex gap-2">
            <button className="inline-flex items-center rounded-lg border border-pink-300/40 bg-gradient-to-r from-neon-pink to-neon-violet px-3 py-2 text-sm font-semibold text-white hover:ring-2 hover:ring-pink-300/30" onClick={() => fileInputRef.current?.click()}>Add Photos</button>
            <button className="inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-100/60 px-3 py-2 text-sm font-semibold text-cyan-900 hover:ring-2 hover:ring-cyan-400/30 dark:border-cyan-400/30 dark:bg-cyan-900/20 dark:text-cyan-200" onClick={clearAll}>Reset</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map(m => (
            <article key={m.id} className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80">
              <div className="relative aspect-[16/10] grid place-items-center bg-slate-100 dark:bg-slate-950/60" aria-label={m.title} role="img">
                {m.objectUrl || m.url ? (
                  <img className="h-full w-full object-cover" src={m.url || m.objectUrl} alt={m.title} />
                ) : (
                  <div className="h-[76%] w-[92%] rounded-lg border border-dashed border-pink-300/50 bg-gradient-to-br from-pink-50 to-cyan-50 dark:border-slate-700 dark:from-[#1a1d3a] dark:to-[#0f2440]" aria-hidden="true" />
                )}
                <button className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-pink-300/60 bg-white/95 text-slate-900 hover:bg-white dark:border-pink-500 dark:bg-slate-900/80 dark:text-slate-100" onClick={() => removeMemory(m.id)} title="Remove">×</button>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <h4 className="m-0 max-w-[70%] truncate text-sm font-semibold" title={m.title}>{m.title}</h4>
                {m.meta && <span className="text-xs text-slate-500 dark:text-slate-400">{m.meta}</span>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="upload" className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/60">
        <h2 className="mb-1 text-lg font-semibold">Upload Photos</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Drag and drop images anywhere in the box, or pick files to add them to your grid. Files are uploaded to the local API at {API_BASE} and become available under /uploads.</p>
        <div
          className={
            `relative grid place-items-center rounded-xl border border-dashed px-6 py-10 transition-all ` +
            (isDropping ? 'border-pink-400/70 bg-pink-50/60 ring-2 ring-pink-300/30 dark:border-pink-400/70 dark:bg-pink-500/10' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40')
          }
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300">
            <UploadIcon />
            <div className="space-y-1">
              <div><strong>Drag & drop</strong> images here</div>
              <div className="text-slate-500 dark:text-slate-400">or</div>
              <button className="inline-flex items-center justify-center rounded-lg border border-pink-300/40 bg-gradient-to-r from-neon-pink to-neon-violet px-3 py-2 text-sm font-semibold text-white hover:ring-2 hover:ring-pink-300/30" onClick={() => fileInputRef.current?.click()}>Choose files</button>
            </div>
          </div>
          <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={onFileChange} />
          {isUploading && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-300"></span>
              Uploading…
            </div>
          )}
          {uploadError && (
            <div className="absolute inset-x-3 bottom-3 rounded-md border border-pink-400/40 bg-pink-500/10 px-2 py-1 text-xs text-pink-200">
              {uploadError}
            </div>
          )}
        </div>
      </section>
      </div>
    </main>
  )
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

function UploadIcon(){
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 16V4" stroke="#79e9ff" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M8.5 7.5L12 4l3.5 3.5" stroke="#79e9ff" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="#3a91aa" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}
