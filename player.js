// 노래 페이지 재생기. 음 칸(.col)의 data-* 값만 읽는다.
// 소리는 Web Audio로 합성하고, 그림은 서버가 그려 둔 구멍(data-hole)의 클래스만 바꾼다.
// 홈에서는 노래 목록 줄마다 있는 재생 버튼(data-row-play)만 다룬다.
(() => {
  let ctx = null
  const stage = document.querySelector('[data-player]')
  if (!stage) {
    homeRows()
    return
  }
  const cols = [...stage.querySelectorAll('.col')]
  const holes = [...stage.querySelectorAll('.oca-big [data-hole]')]
  const $ = (sel) => stage.querySelector(sel)
  const els = { sol: $('[data-now-sol]'), label: $('[data-now-label]'), icon: $('[data-now-icon]'), how: $('[data-now-how]'), change: $('[data-now-change]'), count: $('[data-now-count]') }
  const controls = $('.controls')
  const playBtn = $('[data-play]')
  const loopBox = $('[data-loop]')
  const moreBox = $('[data-more]')
  const wrap = $('.strip-wrap')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  let index = 0
  let run = null

  const openSet = (i) => new Set((cols[i]?.dataset.open || '').split(' ').filter(Boolean))

  function show(i) {
    index = i
    const col = cols[i]
    const open = openSet(i)
    const before = i > 0 ? openSet(i - 1) : open
    for (const h of holes) {
      const id = h.dataset.hole
      h.classList.toggle('is-open', open.has(id))
      h.classList.toggle('is-changed', before.has(id) !== open.has(id))
    }
    cols.forEach((c, k) => {
      if (k === i) c.setAttribute('aria-current', 'step')
      else c.removeAttribute('aria-current')
      c.style.setProperty('--p', k < i ? 1 : 0)
    })
    els.sol.textContent = col.dataset.sol
    els.label.textContent = col.dataset.label
    // 배경음악 뒷부분 음에는 게임 버튼이 없어 아이콘을 숨긴다.
    els.icon.parentElement.style.visibility = col.dataset.button ? 'visible' : 'hidden'
    if (col.dataset.button) els.icon.setAttribute('href', `#b-${col.dataset.button}`)
    els.how.textContent = col.dataset.how
    els.change.textContent = col.dataset.change
    els.count.textContent = `${i + 1} / ${cols.length}`
    follow(col)
  }

  // 음 칸이 화면보다 길면 지금 음이 보이게 가로로 따라간다. 페이지 세로 위치는 건드리지 않는다.
  function follow(col) {
    if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return
    const left = col.parentElement.offsetLeft
    const right = left + col.parentElement.offsetWidth
    if (left >= wrap.scrollLeft && right <= wrap.scrollLeft + wrap.clientWidth) return
    wrap.scrollTo({ left: Math.max(0, left - wrap.clientWidth / 3), behavior: still.matches ? 'auto' : 'smooth' })
  }

  function audio() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }

  // 사인파 두 개(기음 + 약한 2배음)에 늦게 들어오는 비브라토. 오카리나처럼 맑고 둥근 소리.
  function tone(hz, start, dur) {
    const ac = audio()
    const out = ac.createGain()
    const attack = Math.min(0.03, dur / 3)
    out.gain.setValueAtTime(0, start)
    out.gain.linearRampToValueAtTime(0.2, start + attack)
    out.gain.setValueAtTime(0.2, Math.max(start + attack, start + dur - 0.06))
    out.gain.linearRampToValueAtTime(0, start + dur)
    out.connect(ac.destination)
    const base = ac.createOscillator()
    base.frequency.value = hz
    const over = ac.createOscillator()
    over.frequency.value = hz * 2
    const overGain = ac.createGain()
    overGain.gain.value = 0.05
    const vib = ac.createOscillator()
    vib.frequency.value = 5.5
    const depth = ac.createGain()
    depth.gain.setValueAtTime(0, start)
    depth.gain.linearRampToValueAtTime(hz * 0.004, start + Math.min(0.35, dur))
    vib.connect(depth).connect(base.frequency)
    base.connect(out)
    over.connect(overGain).connect(out)
    const nodes = [base, over, vib]
    for (const n of nodes) { n.start(start); n.stop(start + dur + 0.02) }
    return nodes
  }

  const scale = () => Number(stage.querySelector('[data-speed]:checked')?.value || 1)
  const seconds = (frames) => (Number(frames) / 60) * scale()

  const playable = () => cols.filter((c) => c.dataset.part !== 'more' || !moreBox || moreBox.checked)

  function schedule(from) {
    const events = []
    const nodes = []
    let t = from
    const list = playable()
    const more = list.some((c) => c.dataset.part === 'more')
    for (const c of list) {
      const k = cols.indexOf(c)
      // 뒷부분까지 이어 갈 때는 노래 마지막 음을 배경음악 리듬 길이로 줄인다.
      const cont = more && c.dataset.contFrames
      const dur = seconds(cont ? c.dataset.contFrames : c.dataset.frames)
      nodes.push(...tone(Number(c.dataset.hz), t, dur))
      events.push({ k, start: t, dur })
      t += dur + seconds((cont ? c.dataset.contGap : c.dataset.gap) || 0)
    }
    return { events, nodes, end: t }
  }

  function tick() {
    if (!run) return
    const now = ctx.currentTime
    const current = run.events.filter((e) => e.start <= now).pop()
    if (current) {
      if (current.k !== index) show(current.k)
      cols[current.k].style.setProperty('--p', Math.min(1, (now - current.start) / current.dur))
    }
    if (now >= run.end) {
      if (loopBox.checked) {
        run = { ...schedule(now + 0.6), raf: 0 }
      } else {
        stop()
        return
      }
    }
    run.raf = requestAnimationFrame(tick)
  }

  // 휴대폰에서 재생을 누르면 음 칸·현재 음·오카리나가 한 화면에 들어오게 무대를 맞춘다.
  function bringIntoView() {
    const box = stage.getBoundingClientRect()
    if (box.top >= 0 && box.bottom <= window.innerHeight) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stage.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
  }

  function play() {
    bringIntoView()
    const ac = audio()
    run = { ...schedule(ac.currentTime + 0.1), raf: 0 }
    show(0)
    playBtn.textContent = playBtn.dataset.labelStop
    playBtn.setAttribute('aria-pressed', 'true')
    run.raf = requestAnimationFrame(tick)
  }

  function stop() {
    if (!run) return
    cancelAnimationFrame(run.raf)
    for (const n of run.nodes) { try { n.stop() } catch { /* 이미 멈춤 */ } }
    run = null
    playBtn.textContent = playBtn.dataset.labelPlay
    playBtn.setAttribute('aria-pressed', 'false')
  }

  // 한 음씩 넘길 때는 그 음을 짧게 들려준다. 오카리나로 낸 소리와 맞는지 귀로 비교하는 용도.
  function step(i) {
    stop()
    const k = Math.max(0, Math.min(cols.length - 1, i))
    show(k)
    tone(Number(cols[k].dataset.hz), audio().currentTime + 0.02, Math.min(0.6, seconds(cols[k].dataset.frames) + 0.2))
  }

  // 누를 때만 테두리에 시안 빛이 한 번 지나간다(.is-glint). 같은 버튼을 다시 눌러도 처음부터 다시 돈다.
  for (const b of stage.querySelectorAll('.btn')) {
    b.addEventListener('click', () => { b.classList.remove('is-glint'); void b.offsetWidth; b.classList.add('is-glint') })
    b.addEventListener('animationend', () => b.classList.remove('is-glint'))
  }

  controls.hidden = false
  playBtn.addEventListener('click', () => (run ? stop() : play()))
  $('[data-prev]').addEventListener('click', () => step(index - 1))
  $('[data-next]').addEventListener('click', () => step(index + 1))
  cols.forEach((c, k) => c.addEventListener('click', () => step(k)))
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.target.closest('button, input, a, select, textarea')) return
    if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); step(index + 1 < cols.length ? index + 1 : 0) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(index - 1) }
  })
  show(0)

  // 홈 노래 목록: 한 번에 한 곡만 울린다. 같은 버튼을 다시 누르거나 다른 곡을 누르면 멈춘다.
  function homeRows() {
    let now = null
    const stopRow = () => {
      if (!now) return
      cancelAnimationFrame(now.raf)
      for (const n of now.nodes) { try { n.stop() } catch { /* 이미 멈춤 */ } }
      for (const i of now.icons) i.classList.remove('is-now')
      now.btn.setAttribute('aria-pressed', 'false')
      now = null
    }
    for (const btn of document.querySelectorAll('[data-row-play]')) {
      btn.hidden = false
      btn.addEventListener('click', () => {
        const same = now?.btn === btn
        stopRow()
        if (!same) now = playRow(btn, stopRow)
      })
    }
  }

  // data-steps는 "주파수:프레임:쉼 프레임"을 공백으로 이은 값이다. 게임 빠르기(1/60초)로만 울리고,
  // 지금 나는 음의 버튼 아이콘을 밝혀 게임에서 누를 버튼을 바로 보이게 한다.
  function playRow(btn, done) {
    const ac = audio()
    const icons = [...btn.closest('li').querySelectorAll('.btnseq .bi')]
    const row = { btn, icons, nodes: [], raf: 0 }
    const starts = []
    let t = ac.currentTime + 0.1
    for (const s of btn.dataset.steps.split(' ')) {
      const [hzValue, frames, gap] = s.split(':').map(Number)
      row.nodes.push(...tone(hzValue, t, frames / 60))
      starts.push(t)
      t += (frames + gap) / 60
    }
    const frame = () => {
      const k = starts.filter((s) => s <= ac.currentTime).length - 1
      icons.forEach((i, j) => i.classList.toggle('is-now', j === k))
      if (ac.currentTime >= t) return done()
      row.raf = requestAnimationFrame(frame)
    }
    btn.setAttribute('aria-pressed', 'true')
    row.raf = requestAnimationFrame(frame)
    return row
  }
})()
