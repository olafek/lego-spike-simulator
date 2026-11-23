// Three.js view of a simulation timeline. Display only: it never computes motion, it shows the
// Frame it is given. World units are millimetres; sim (x, y, height) maps to three (x, height, -y)
// and a robot heading h (clockwise from +y) is `rotation.y = -h`.

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { toolRects } from '@/core/attachmentGeometry'
import { COLOR_HEX, type ColorName } from '@/core/catalog'
import type { CameraMode, ProjectSettings } from '@/core/project'
import { ATTACHMENTS, type AttachmentInstance, type RobotConfig } from '@/core/robots'
import { OBJECT_DEFS, objectSize, type Scene, type SceneObject } from '@/core/scene'
import { matBounds, type Frame, type SimResult } from '@/core/simulate'
import { DEG, mmToDisplay, round } from '@/core/units'
import { decimateTrail, distanceMarks, fitOrtho, gridLabel, gridLines, isMultiple, labelStep, minorVisible, trailCountAt, type Bounds, type DistanceMark, type TrailPoint } from './scale'

export interface RendererSetup {
  robot: RobotConfig
  attachments: AttachmentInstance[]
  scene: Scene
  settings: ProjectSettings
  /** a straightened photo of a table, drawn on the floor of a walled mat */
  matImageUrl?: string | null
}

export interface RendererOptions {
  /** px per mm of the top (orthographic) view, or null in perspective views */
  onScale(info: { pxPerMm: number | null }): void
}

const C = {
  floor: 0xeef1fb,
  outside: 0xd6dcf2,
  major: 0x7d8cc8,
  minor: 0xc3cbea,
  axis: 0x3a4690,
  trail: 0xff4ccd,
  preview: 0x8a93c8,
  start: 0x22a84a,
  end: 0xf5a700,
  footprint: 0xff4ccd,
  frame: 0xd9dde8,
  frameDark: 0xaab1c4,
  hub: 0xf6f6f2,
  hubFace: 0xffd23f,
  tyre: 0x1b1f2a,
  rim: 0x4cc9f0,
  motor: 0x9aa3b5,
  tool: 0xffd23f,
  toolDark: 0x4b5368,
  jaw: 0x34ccf1,
  sensor: 0xf4f6ff,
}

const GRID_Y = 0.2
const FLAT_Y = 0.7
const MARK_Y = 1.6
const TRAIL_Y = 3

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else if (mat) mat.dispose()
  })
}

function clearGroup(g: THREE.Group): void {
  for (const child of [...g.children]) {
    g.remove(child)
    disposeTree(child)
  }
}

interface ToolView {
  inst: AttachmentInstance
  /** rotates for lift joints */
  pivot: THREE.Group
  parts: THREE.Mesh[]
  height: number
}

interface SensorView {
  inst: AttachmentInstance
  cone?: THREE.Mesh
  ray?: THREE.Mesh
}

export class SceneRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene3 = new THREE.Scene()
  private readonly ortho: THREE.OrthographicCamera
  private readonly orbitCam: THREE.PerspectiveCamera
  private readonly chaseCam: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly dom: HTMLCanvasElement

  private readonly gridG = new THREE.Group()
  private readonly labelG = new THREE.Group()
  private readonly objectsG = new THREE.Group()
  private readonly markersG = new THREE.Group()
  private readonly robotG = new THREE.Group()
  private minorLines: THREE.LineSegments | null = null
  private labels: Array<{ sprite: THREE.Sprite; k: number; aspect: number }> = []
  private readonly textures = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

  private setup: RendererSetup | null = null
  private result: SimResult | null = null
  private frameIndex = 0
  private mode: CameraMode = 'top'

  private robotKey = ''
  private sceneKey = ''
  private gridKey = ''
  private markKey = ''

  private wheelL: THREE.Object3D | null = null
  private wheelR: THREE.Object3D | null = null
  private tools: ToolView[] = []
  private sensors: SensorView[] = []
  private matrixOff: THREE.Texture | null = null
  private matrixOn: THREE.Texture | null = null
  private matrixMat: THREE.MeshBasicMaterial | null = null
  private objectViews = new Map<string, THREE.Object3D>()

  private trailPts: TrailPoint[] = []
  private trail: Line2 | null = null
  private trailMat: LineMaterial | null = null
  private trailHead: Line2 | null = null
  private marks: Array<{ mark: DistanceMark; node: THREE.Object3D }> = []

  private width = 1
  private height = 1
  private raf = 0
  private disposed = false
  private userMoved = false
  private lastScale: number | null | undefined = undefined

  // orthographic view state (sim coordinates of the screen centre + zoom in px/mm)
  private cx = 0
  private cy = 0
  private zoom = 0.5
  private chaseZoom = 1
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0

  // chase camera transition
  private blendFrom: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
  private blendStart = 0
  private readonly chaseTarget = new THREE.Vector3()

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: RendererOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setClearColor(C.outside)
    this.dom = this.renderer.domElement
    this.dom.style.display = 'block'
    this.dom.style.width = '100%'
    this.dom.style.height = '100%'
    this.dom.style.touchAction = 'none'
    this.dom.setAttribute('aria-label', 'Robot simulation view')
    this.dom.setAttribute('role', 'img')
    container.appendChild(this.dom)

    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000)
    this.ortho.up.set(0, 0, -1) // sim +y points up the screen
    this.orbitCam = new THREE.PerspectiveCamera(45, 1, 5, 40000)
    this.orbitCam.position.set(-700, 900, 900)
    this.chaseCam = new THREE.PerspectiveCamera(45, 1, 5, 40000)

    this.controls = new OrbitControls(this.orbitCam, this.dom)
    this.controls.enableDamping = false
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    this.controls.minDistance = 150
    this.controls.maxDistance = 9000
    this.controls.enabled = false
    this.controls.addEventListener('change', () => {
      if (this.mode === 'orbit') {
        this.userMoved = true
        this.requestRender()
      }
    })

    this.scene3.add(new THREE.HemisphereLight(0xffffff, 0xb9c2e6, 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-600, 1500, 800)
    this.scene3.add(sun)
    this.scene3.add(this.gridG, this.labelG, this.objectsG, this.markersG, this.robotG)

    this.dom.addEventListener('pointerdown', this.onPointerDown)
    this.dom.addEventListener('pointermove', this.onPointerMove)
    this.dom.addEventListener('pointerup', this.onPointerUp)
    this.dom.addEventListener('pointercancel', this.onPointerUp)
    this.dom.addEventListener('wheel', this.onWheel, { passive: false })
    this.dom.addEventListener('webglcontextlost', this.onContextLost)
    this.dom.addEventListener('webglcontextrestored', this.onContextRestored)

    this.resize()
  }

  // ---- public API ---------------------------------------------------------------------------

  setSetup(s: RendererSetup): void {
    this.setup = s
    const robotKey = JSON.stringify([s.robot, s.attachments])
    const sceneKey = JSON.stringify([s.scene.objects, s.scene.start])
    const gridKey = JSON.stringify([s.settings.gridMajorMm, s.settings.gridMinorMm, s.settings.unit, s.settings.gridLabels, s.scene.mat, s.scene.floor, s.matImageUrl ?? null])
    const markKey = JSON.stringify([s.settings.trail, s.settings.distanceMarkers, s.settings.gridMajorMm, s.settings.unit, s.scene.start, s.robot.chassis, s.robot.trackWidthMm, s.robot.wheelWidthMm])
    if (gridKey !== this.gridKey) {
      this.gridKey = gridKey
      this.buildGrid()
    }
    if (robotKey !== this.robotKey) {
      this.robotKey = robotKey
      this.buildRobot()
    }
    if (sceneKey !== this.sceneKey) {
      this.sceneKey = sceneKey
      this.buildObjects()
    }
    if (markKey !== this.markKey) {
      this.markKey = markKey
      this.buildMarkers()
    }
    this.applyFrame()
    this.updateGridDetail()
    if (!this.userMoved) this.fit()
    this.requestRender()
  }

  setTimeline(result: SimResult | null): void {
    this.result = result
    this.frameIndex = Math.min(this.frameIndex, Math.max(0, (result?.frames.length ?? 1) - 1))
    this.buildMarkers()
    this.applyFrame()
    if (!this.userMoved) this.fit()
    this.requestRender()
  }

  setFrame(index: number): void {
    const max = Math.max(0, (this.result?.frames.length ?? 1) - 1)
    this.frameIndex = Math.min(max, Math.max(0, Math.floor(index)))
    this.applyFrame()
    this.requestRender()
  }

  setCamera(mode: CameraMode): void {
    if (mode === this.mode) return
    const from = this.activeCamera()
    const wasPerspective = this.mode !== 'top'
    this.mode = mode
    this.controls.enabled = mode === 'orbit'
    if (mode === 'orbit' && !this.userMoved) this.fitOrbit()
    if (mode === 'behind' || mode === 'side' || mode === 'follow') {
      if (wasPerspective && !reducedMotion()) {
        const target = from === this.orbitCam ? this.controls.target.clone() : this.chaseTarget.clone()
        this.blendFrom = { pos: from.position.clone(), target }
        this.blendStart = performance.now()
      } else this.blendFrom = null
    }
    this.updateGridDetail()
    this.emitScale()
    this.requestRender()
  }

  resize(): void {
    const w = Math.max(1, Math.floor(this.container.clientWidth))
    const h = Math.max(1, Math.floor(this.container.clientHeight))
    const first = this.width === 1 && this.height === 1
    this.width = w
    this.height = h
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setSize(w, h, false)
    for (const cam of [this.orbitCam, this.chaseCam]) {
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    this.trailMat?.resolution.set(w, h)
    if (this.trailHead) (this.trailHead.material as LineMaterial).resolution.set(w, h)
    if (first || !this.userMoved) this.fit()
    this.updateGridDetail()
    this.emitScale()
    this.requestRender()
  }

  /** factor > 1 zooms in. */
  zoomBy(factor: number): void {
    if (!(factor > 0)) return
    this.userMoved = true
    if (this.mode === 'top') this.zoom = Math.min(12, Math.max(0.03, this.zoom * factor))
    else if (this.mode === 'orbit') {
      const off = this.orbitCam.position.clone().sub(this.controls.target)
      const len = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length() / factor))
      this.orbitCam.position.copy(this.controls.target).add(off.setLength(len))
      this.controls.update()
    } else this.chaseZoom = Math.min(4, Math.max(0.35, this.chaseZoom / factor))
    this.updateGridDetail()
    this.emitScale()
    this.requestRender()
  }

  resetView(): void {
    this.userMoved = false
    this.chaseZoom = 1
    this.fit()
    this.updateGridDetail()
    this.emitScale()
    this.requestRender()
  }

  requestRender(): void {
    if (this.raf || this.disposed) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.render()
    })
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.dom.removeEventListener('pointerdown', this.onPointerDown)
    this.dom.removeEventListener('pointermove', this.onPointerMove)
    this.dom.removeEventListener('pointerup', this.onPointerUp)
    this.dom.removeEventListener('pointercancel', this.onPointerUp)
    this.dom.removeEventListener('wheel', this.onWheel)
    this.dom.removeEventListener('webglcontextlost', this.onContextLost)
    this.dom.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.controls.dispose()
    disposeTree(this.scene3)
    for (const t of this.textures.values()) t.tex.dispose()
    this.textures.clear()
    this.matrixOff?.dispose()
    this.matrixOn?.dispose()
    this.renderer.dispose()
    this.dom.remove()
  }

  // ---- rendering ----------------------------------------------------------------------------

  private activeCamera(): THREE.Camera {
    return this.mode === 'top' ? this.ortho : this.mode === 'orbit' ? this.orbitCam : this.chaseCam
  }

  private render(): void {
    if (this.disposed) return
    let cam: THREE.Camera
    if (this.mode === 'top') {
      const o = this.ortho
      o.left = -this.width / 2
      o.right = this.width / 2
      o.top = this.height / 2
      o.bottom = -this.height / 2
      o.zoom = this.zoom
      o.position.set(this.cx, 5000, -this.cy)
      o.lookAt(this.cx, 0, -this.cy)
      o.updateProjectionMatrix()
      cam = o
    } else if (this.mode === 'orbit') {
      cam = this.orbitCam
    } else {
      this.placeChaseCamera()
      cam = this.chaseCam
    }
    this.renderer.render(this.scene3, cam)
  }

  private currentFrame(): Frame | null {
    return this.result?.frames[this.frameIndex] ?? null
  }

  private robotPose(): { x: number; y: number; h: number } {
    const f = this.currentFrame()
    if (f) return { x: f.x, y: f.y, h: f.h }
    const s = this.setup?.scene.start
    return s ? { x: s.x, y: s.y, h: s.headingDeg * DEG } : { x: 0, y: 0, h: 0 }
  }

  private placeChaseCamera(): void {
    const p = this.robotPose()
    const z = this.chaseZoom
    const P = new THREE.Vector3(p.x, 0, -p.y)
    const F = new THREE.Vector3(Math.sin(p.h), 0, -Math.cos(p.h))
    const pos = new THREE.Vector3()
    const target = new THREE.Vector3()
    if (this.mode === 'behind') {
      pos.copy(P).addScaledVector(F, -560 * z).add(new THREE.Vector3(0, 340 * z, 0))
      target.copy(P).addScaledVector(F, 160).add(new THREE.Vector3(0, 30, 0))
    } else if (this.mode === 'side') {
      // fixed world side: the robot's "forward" (+y) runs left-to-right when it faces up the mat
      pos.copy(P).add(new THREE.Vector3(760 * z, 300 * z, 0))
      target.copy(P).add(new THREE.Vector3(0, 40, 0))
    } else {
      pos.copy(P).add(new THREE.Vector3(0, 1000 * z, 420 * z))
      target.copy(P)
    }
    if (this.blendFrom) {
      const t = Math.min(1, (performance.now() - this.blendStart) / 420)
      const k = t * t * (3 - 2 * t)
      pos.lerpVectors(this.blendFrom.pos, pos, k)
      target.lerpVectors(this.blendFrom.target, target, k)
      if (t >= 1) this.blendFrom = null
      else this.requestRender()
    }
    this.chaseTarget.copy(target)
    this.chaseCam.position.copy(pos)
    this.chaseCam.lookAt(target)
  }

  private emitScale(): void {
    const v = this.mode === 'top' ? this.zoom : null
    if (v === this.lastScale) return
    this.lastScale = v
    this.opts.onScale({ pxPerMm: v })
  }

  /** px per mm near the point the camera looks at (exact in top view, approximate otherwise). */
  private approxPxPerMm(): number {
    if (this.mode === 'top') return this.zoom
    const cam = this.mode === 'orbit' ? this.orbitCam : this.chaseCam
    const target = this.mode === 'orbit' ? this.controls.target : this.chaseTarget
    const dist = Math.max(50, cam.position.distanceTo(target))
    return this.height / (2 * Math.tan((cam.fov * DEG) / 2) * dist)
  }

  private updateGridDetail(): void {
    const s = this.setup?.settings
    if (!s) return
    const ppm = this.approxPxPerMm()
    if (this.minorLines) this.minorLines.visible = minorVisible(ppm * s.gridMinorMm, this.mode === 'top' ? 6 : 9)
    const step = labelStep(ppm * s.gridMajorMm)
    const top = this.mode === 'top'
    for (const l of this.labels) {
      const show = s.gridLabels && l.k % step === 0
      l.sprite.visible = show
      if (!show) continue
      // top view: constant readable pixel size; perspective: a size tied to the grid cell
      const hMm = top ? Math.min(15 / ppm, s.gridMajorMm * step * 0.42) : s.gridMajorMm * 0.3 * Math.min(step, 3)
      l.sprite.scale.set(hMm * l.aspect, hMm, 1)
    }
  }

  // ---- view fitting -------------------------------------------------------------------------

  private bounds(): Bounds {
    const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const add = (x: number, y: number, r: number) => {
      b.minX = Math.min(b.minX, x - r)
      b.maxX = Math.max(b.maxX, x + r)
      b.minY = Math.min(b.minY, y - r)
      b.maxY = Math.max(b.maxY, y + r)
    }
    const reach = 190
    const start = this.setup?.scene.start
    if (start) add(start.x, start.y, reach)
    else add(0, 0, reach)
    for (const p of this.trailPts) add(p.x, p.y, reach)
    const frames = this.result?.frames
    if (frames?.length) add(frames[frames.length - 1].x, frames[frames.length - 1].y, reach)
    for (const o of this.setup?.scene.objects ?? []) {
      const s = objectSize(o)
      add(o.x, o.y, Math.max(s.r, Math.hypot(s.w, s.l) / 2) + 20)
    }
    const last = frames?.[frames.length - 1]
    for (const o of last?.objects ?? []) add(o.x, o.y, 60)
    return b
  }

  private fit(): void {
    const b = this.bounds()
    const f = fitOrtho(b, this.width, this.height)
    this.cx = f.cx
    this.cy = f.cy
    this.zoom = Math.min(12, Math.max(0.03, f.pxPerMm))
    if (this.mode === 'orbit') this.fitOrbit()
    this.emitScale()
  }

  private fitOrbit(): void {
    const b = this.bounds()
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const d = Math.max(b.maxX - b.minX, b.maxY - b.minY, 800)
    this.controls.target.set(cx, 0, -cy)
    this.orbitCam.position.set(cx - d * 0.55, d * 0.85, -cy + d * 0.95)
    this.controls.update()
  }

  // ---- input (top view pan/zoom; other modes zoom only) ---------------------------------------

  private local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.dom.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** Zoom the top view keeping the world point under (px, py) fixed. */
  private zoomTopAt(px: number, py: number, factor: number): void {
    const wx = this.cx + (px - this.width / 2) / this.zoom
    const wy = this.cy - (py - this.height / 2) / this.zoom
    this.zoom = Math.min(12, Math.max(0.03, this.zoom * factor))
    this.cx = wx - (px - this.width / 2) / this.zoom
    this.cy = wy + (py - this.height / 2) / this.zoom
    this.userMoved = true
    this.updateGridDetail()
    this.emitScale()
    this.requestRender()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.mode === 'orbit') return
    this.pointers.set(e.pointerId, this.local(e))
    try {
      this.dom.setPointerCapture(e.pointerId)
    } catch {
      /* not capturable */
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.mode === 'orbit') return
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const cur = this.local(e)
    this.pointers.set(e.pointerId, cur)
    if (this.pointers.size === 1) {
      if (this.mode !== 'top') return
      this.cx -= (cur.x - prev.x) / this.zoom
      this.cy += (cur.y - prev.y) / this.zoom
      this.userMoved = true
      this.requestRender()
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.pinchDist > 0 && dist > 0) {
        const factor = dist / this.pinchDist
        if (this.mode === 'top') this.zoomTopAt((a.x + b.x) / 2, (a.y + b.y) / 2, factor)
        else this.zoomBy(factor)
      }
      this.pinchDist = dist
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    this.pinchDist = 0
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.mode === 'orbit') return // OrbitControls handles it
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * 0.0015)
    if (this.mode === 'top') {
      const p = this.local(e)
      this.zoomTopAt(p.x, p.y, factor)
    } else this.zoomBy(factor)
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault()
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private onContextRestored = (): void => {
    this.requestRender()
  }

  // ---- text sprites -------------------------------------------------------------------------

  private textTexture(text: string, color: string, bg: string | null = null): { tex: THREE.CanvasTexture; aspect: number } {
    const key = `${text}|${color}|${bg}`
    const hit = this.textures.get(key)
    if (hit) return hit
    const h = 64
    const font = '800 44px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif'
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = font
    const w = Math.max(h, Math.ceil(probe.measureText(text).width) + 28)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')!
    if (bg) {
      g.fillStyle = bg
      g.beginPath()
      g.roundRect(2, 4, w - 4, h - 8, 26)
      g.fill()
    }
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (!bg) {
      g.lineWidth = 8
      g.strokeStyle = 'rgba(238,241,251,0.92)'
      g.strokeText(text, w / 2, h / 2 + 2)
    }
    g.fillStyle = color
    g.fillText(text, w / 2, h / 2 + 2)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const entry = { tex, aspect: w / h }
    this.textures.set(key, entry)
    return entry
  }

  private sprite(text: string, color: string, bg: string | null = null): { sprite: THREE.Sprite; aspect: number } {
    const t = this.textTexture(text, color, bg)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, depthWrite: false }))
    sprite.renderOrder = 10
    return { sprite, aspect: t.aspect }
  }

  // ---- grid ---------------------------------------------------------------------------------

  private buildGrid(): void {
    clearGroup(this.gridG)
    clearGroup(this.labelG)
    this.labels = []
    this.minorLines = null
    const s = this.setup
    if (!s) return
    const { gridMajorMm: major, gridMinorMm: minor, unit } = s.settings
    const bounds = matBounds(s.scene.mat)
    const classroom = bounds !== null
    const onPicture = classroom && !!s.matImageUrl
    const ext = bounds ?? { x0: -3000, x1: 3000, y0: -3000, y1: 3000 }
    const floorColor = s.scene.floor === 'white' ? C.floor : new THREE.Color(COLOR_HEX[s.scene.floor as ColorName] ?? '#eef1fb').lerp(new THREE.Color(0xffffff), 0.35).getHex()

    const flat = (w: number, l: number, color: number, y: number, x = 0, sy = 0): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ color }))
      m.rotation.x = -Math.PI / 2
      m.position.set(x, y, -sy)
      return m
    }
    if (classroom) {
      this.gridG.add(flat(20000, 20000, C.outside, -2))
      const matFloor = flat(ext.x1 - ext.x0, ext.y1 - ext.y0, floorColor, -1, (ext.x0 + ext.x1) / 2, (ext.y0 + ext.y1) / 2)
      this.gridG.add(matFloor)
      if (s.matImageUrl) {
        // the photo of the table replaces the plain floor once it has loaded
        const url = s.matImageUrl
        new THREE.TextureLoader().load(url, (texture) => {
          if (this.setup?.matImageUrl !== url || matFloor.parent !== this.gridG) {
            texture.dispose()
            return
          }
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = 8
          const material = matFloor.material as THREE.MeshBasicMaterial
          material.map = texture
          material.color.set(0xffffff)
          material.needsUpdate = true
          this.requestRender()
        })
      }
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x5a6388 })
      const t = 20
      const wall = (cx: number, cy: number, w: number, l: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 40, l), wallMat)
        m.position.set(cx, 20, -cy)
        this.gridG.add(m)
      }
      wall((ext.x0 + ext.x1) / 2, ext.y0 - t / 2, ext.x1 - ext.x0 + 2 * t, t)
      wall((ext.x0 + ext.x1) / 2, ext.y1 + t / 2, ext.x1 - ext.x0 + 2 * t, t)
      wall(ext.x0 - t / 2, (ext.y0 + ext.y1) / 2, t, ext.y1 - ext.y0)
      wall(ext.x1 + t / 2, (ext.y0 + ext.y1) / 2, t, ext.y1 - ext.y0)
    } else {
      this.gridG.add(flat(20000, 20000, C.outside, -2))
      this.gridG.add(flat(ext.x1 - ext.x0, ext.y1 - ext.y0, floorColor, -1))
    }

    // lines: exact multiples of the spacing in world mm, so the grid can never drift from physics
    const segs = (xs: number[], ys: number[]): THREE.BufferGeometry => {
      const v: number[] = []
      for (const x of xs) v.push(x, GRID_Y, -ext.y0, x, GRID_Y, -ext.y1)
      for (const y of ys) v.push(ext.x0, GRID_Y, -y, ext.x1, GRID_Y, -y)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
      return g
    }
    const majorX = gridLines(ext.x0, ext.x1, major)
    const majorY = gridLines(ext.y0, ext.y1, major)
    const minorX = gridLines(ext.x0, ext.x1, minor).filter((x) => !isMultiple(x, major))
    const minorY = gridLines(ext.y0, ext.y1, minor).filter((y) => !isMultiple(y, major))
    this.minorLines = new THREE.LineSegments(segs(minorX, minorY), new THREE.LineBasicMaterial({ color: C.minor, transparent: onPicture, opacity: onPicture ? 0.35 : 1 }))
    this.gridG.add(this.minorLines)
    const majorLines = new THREE.LineSegments(segs(majorX, majorY), new THREE.LineBasicMaterial({ color: C.major, transparent: onPicture, opacity: onPicture ? 0.5 : 1 }))
    majorLines.position.y = 0.1
    this.gridG.add(majorLines)

    // axes through the origin + arrows
    const strip = (w: number, l: number, color: number, x: number, y: number): void => {
      const m = flat(w, l, color, GRID_Y + 0.25, x, y)
      this.gridG.add(m)
    }
    const axisW = Math.max(2, major * 0.025)
    if (ext.x0 <= 0 && ext.x1 >= 0) strip(axisW, ext.y1 - ext.y0, C.axis, 0, (ext.y0 + ext.y1) / 2)
    if (ext.y0 <= 0 && ext.y1 >= 0) strip(ext.x1 - ext.x0, axisW, C.axis, (ext.x0 + ext.x1) / 2, 0)
    const arrow = (color: number, alongX: boolean, text: string): void => {
      const len = major * 0.7
      const w = Math.max(4, major * 0.06)
      const shaft = flat(alongX ? len : w, alongX ? w : len, color, GRID_Y + 0.4, alongX ? len / 2 : 0, alongX ? 0 : len / 2)
      this.gridG.add(shaft)
      const tri = new THREE.Shape()
      tri.moveTo(0, w * 2.2)
      tri.lineTo(-w * 1.6, 0)
      tri.lineTo(w * 1.6, 0)
      const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color }))
      head.rotation.x = -Math.PI / 2
      if (alongX) head.rotation.z = -Math.PI / 2
      head.position.set(alongX ? len : 0, GRID_Y + 0.4, alongX ? 0 : -len)
      this.gridG.add(head)
      const { sprite, aspect } = this.sprite(text, alongX ? '#c0182a' : '#177a36')
      const hMm = major * 0.3
      sprite.scale.set(hMm * aspect, hMm, 1)
      sprite.position.set(alongX ? len + w * 5 : -w * 4, 2, alongX ? w * 4 : -(len + w * 5))
      this.gridG.add(sprite)
    }
    arrow(0xe3242b, true, 'x')
    arrow(0x22a84a, false, 'y')
    const ring = new THREE.Mesh(new THREE.RingGeometry(major * 0.05, major * 0.09, 24), new THREE.MeshBasicMaterial({ color: C.axis }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = GRID_Y + 0.5
    this.gridG.add(ring)

    // numbers on the major lines, along both axes (in the display unit)
    const off = major * 0.2
    const addLabel = (mm: number, alongX: boolean): void => {
      const k = Math.round(mm / major)
      const { sprite, aspect } = this.sprite(gridLabel(mm, unit), '#2b3676')
      sprite.position.set(alongX ? mm : -off * 1.5, 1, alongX ? off : -mm)
      this.labelG.add(sprite)
      this.labels.push({ sprite, k: Math.abs(k), aspect })
    }
    for (const x of majorX) if (Math.abs(x) > 1e-6) addLabel(x, true)
    for (const y of majorY) if (Math.abs(y) > 1e-6) addLabel(y, false)
    const zero = this.sprite('0', '#2b3676')
    zero.sprite.position.set(-off * 1.5, 1, off)
    this.labelG.add(zero.sprite)
    this.labels.push({ sprite: zero.sprite, k: 0, aspect: zero.aspect })
    this.updateGridDetail()
  }

  // ---- robot --------------------------------------------------------------------------------

  private footprintPoints(): THREE.Vector3[] {
    const r = this.setup!.robot
    const half = Math.max(r.chassis.widthMm, r.trackWidthMm + r.wheelWidthMm) / 2
    return [
      new THREE.Vector3(-half, 0, r.chassis.rearMm),
      new THREE.Vector3(half, 0, r.chassis.rearMm),
      new THREE.Vector3(half, 0, -r.chassis.frontMm),
      new THREE.Vector3(-half, 0, -r.chassis.frontMm),
    ]
  }

  private matrixTexture(on: boolean): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = '#20263a'
    g.fillRect(0, 0, 64, 64)
    const smile = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0]
    for (let i = 0; i < 25; i++) {
      g.fillStyle = on && smile[i] ? '#fff7b0' : on ? '#5b5a3a' : '#3a4160'
      g.fillRect(6 + (i % 5) * 11, 6 + Math.floor(i / 5) * 11, 8, 8)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  private buildRobot(): void {
    clearGroup(this.robotG)
    this.tools = []
    this.sensors = []
    this.wheelL = null
    this.wheelR = null
    const s = this.setup
    if (!s) return
    const r = s.robot
    const big = r.motorType === 'large'
    const wheelR = r.wheelDiameterMm / 2
    const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
    /** box in the robot frame: centre (lx, ly), size (w along x, l along y), from height h0 to h1 */
    const box = (w: number, l: number, h0: number, h1: number, lx: number, ly: number, mat: THREE.Material, parent: THREE.Object3D = this.robotG): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h1 - h0, l), mat)
      m.position.set(lx, (h0 + h1) / 2, -ly)
      parent.add(m)
      return m
    }

    // footprint outline on the floor (same rectangle the physics engine collides with)
    const fp = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(this.footprintPoints()), new THREE.LineBasicMaterial({ color: C.footprint }))
    fp.position.y = MARK_Y
    this.robotG.add(fp)

    // frame
    const frameW = Math.max(24, r.trackWidthMm - r.wheelWidthMm - 6)
    const frameLen = r.chassis.frontMm + r.chassis.rearMm
    const frameMid = (r.chassis.frontMm - r.chassis.rearMm) / 2
    const baseH = Math.max(10, wheelR * 0.45)
    const frameTop = baseH + (big ? 24 : 16)
    box(frameW, frameLen, baseH, frameTop, 0, frameMid, lam(big ? C.frameDark : C.frame))
    // side beams (studded look: a darker strip)
    for (const sx of [-1, 1]) box(8, frameLen, frameTop, frameTop + 8, sx * (frameW / 2 - 4), frameMid, lam(big ? 0x2f66d0 : 0x34ccf1))

    // hub: 88 x 56 x 32 mm, long side along the robot
    const hubY = frameMid - (big ? 8 : 4)
    const hubW = Math.min(56, frameW)
    box(hubW, 88, frameTop, frameTop + 32, 0, hubY, lam(C.hub))
    box(hubW - 6, 60, frameTop + 32, frameTop + 33.5, 0, hubY + 6, lam(C.hubFace))
    this.matrixOff?.dispose()
    this.matrixOn?.dispose()
    this.matrixOff = this.matrixTexture(false)
    this.matrixOn = this.matrixTexture(true)
    this.matrixMat = new THREE.MeshBasicMaterial({ map: this.matrixOff })
    const matrix = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), this.matrixMat)
    matrix.rotation.x = -Math.PI / 2
    matrix.position.set(0, frameTop + 34.4, -(hubY + 10))
    this.robotG.add(matrix)
    // round hub button
    const button = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2, 20), lam(0xffffff))
    button.position.set(0, frameTop + 34.5, -(hubY - 22))
    this.robotG.add(button)

    // drive wheels + motors
    const motorSize = big ? { w: 34, l: 76, h: 34 } : { w: 24, l: 58, h: 24 }
    const makeWheel = (side: -1 | 1): THREE.Object3D => {
      const holder = new THREE.Group()
      holder.position.set((side * r.trackWidthMm) / 2, wheelR, 0)
      const spin = new THREE.Group()
      holder.add(spin)
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, r.wheelWidthMm, 28), lam(C.tyre))
      tyre.rotation.z = Math.PI / 2
      spin.add(tyre)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, r.wheelWidthMm + 2, 24), lam(C.rim))
      rim.rotation.z = Math.PI / 2
      spin.add(rim)
      // spokes on the outside face so the spin is visible
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.5, wheelR * 1.16, wheelR * 0.16), lam(0xffffff))
        spoke.position.x = side * (r.wheelWidthMm / 2 + 1.4)
        spoke.rotation.x = (i * Math.PI) / 3
        spin.add(spoke)
      }
      const dot = new THREE.Mesh(new THREE.BoxGeometry(1.8, wheelR * 0.22, wheelR * 0.22), lam(0xff4ccd))
      dot.position.set(side * (r.wheelWidthMm / 2 + 1.8), wheelR * 0.42, 0)
      spin.add(dot)
      this.robotG.add(holder)
      const mx = side * Math.max(motorSize.w / 2, r.trackWidthMm / 2 - r.wheelWidthMm / 2 - motorSize.w / 2 - 2)
      box(motorSize.w, motorSize.l, wheelR - motorSize.h / 2, wheelR + motorSize.h / 2, mx, -motorSize.l / 2 + 14, lam(C.motor))
      box(motorSize.w * 0.7, 6, wheelR - motorSize.h / 2 + 3, wheelR + motorSize.h / 2 - 3, mx, -motorSize.l + 12, lam(0x34ccf1))
      return spin
    }
    this.wheelL = makeWheel(-1)
    this.wheelR = makeWheel(1)
    this.portSticker(r.drive.left.port, -r.trackWidthMm / 2, -10, wheelR * 2 + 14)
    this.portSticker(r.drive.right.port, r.trackWidthMm / 2, -10, wheelR * 2 + 14)

    // rear caster ball
    const casterR = Math.max(6, baseH / 2)
    const caster = new THREE.Mesh(new THREE.SphereGeometry(casterR, 16, 12), lam(0x6b7280))
    caster.position.set(0, casterR, r.chassis.rearMm - casterR - 6)
    this.robotG.add(caster)

    // heading arrow on top of the hub
    const tri = new THREE.Shape()
    tri.moveTo(0, 12)
    tri.lineTo(-9, -6)
    tri.lineTo(9, -6)
    const nose = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: 0xff4ccd }))
    nose.rotation.x = -Math.PI / 2
    nose.position.set(0, frameTop + 34.6, -(hubY + 36))
    this.robotG.add(nose)

    // tools and sensors
    for (const inst of s.attachments) {
      const def = ATTACHMENTS[inst.kind]
      if (!def) continue
      if (def.group === 'tool' || inst.kind === 'force_sensor') this.buildTool(inst)
      if (def.sensor === 'color') {
        const mount = inst.slot === 1 && r.mounts.colorSensor2 ? r.mounts.colorSensor2 : r.mounts.colorSensor
        box(16, 24, 14, 30, mount.x, mount.y, lam(C.sensor))
        box(18, 6, 18, 26, mount.x, mount.y + 12, lam(0x34ccf1))
        const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
        cone.position.set(mount.x, 7, -mount.y)
        this.robotG.add(cone)
        this.sensors.push({ inst, cone })
        if (inst.port) this.portSticker(inst.port, mount.x, mount.y, 44)
      } else if (def.sensor === 'distance') {
        const y = r.mounts.frontMm - 10
        const h0 = frameTop + 2
        box(48, 16, h0, h0 + 22, 0, y, lam(C.sensor))
        for (const sx of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3, 18), lam(0x1b1f2a))
          eye.rotation.x = Math.PI / 2
          eye.position.set(sx * 12, h0 + 11, -(y + 9))
          this.robotG.add(eye)
        }
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ color: 0x34ccf1, transparent: true, opacity: 0.55, depthWrite: false }))
        ray.rotation.x = -Math.PI / 2
        ray.visible = false
        this.robotG.add(ray)
        this.sensors.push({ inst, ray })
        if (inst.port) this.portSticker(inst.port, 0, y, h0 + 40)
      }
    }
  }

  private portSticker(port: string, lx: number, ly: number, h: number): void {
    const { sprite, aspect } = this.sprite(port, '#ffffff', '#26327a')
    sprite.scale.set(20 * aspect, 20, 1)
    sprite.position.set(lx, h, -ly)
    this.robotG.add(sprite)
  }

  private buildTool(inst: AttachmentInstance): void {
    const r = this.setup!.robot
    const def = ATTACHMENTS[inst.kind]
    const height = inst.kind === 'dozer' ? 34 : inst.kind === 'bumper' ? 18 : inst.kind === 'custom' ? 22 : inst.kind === 'hook' ? 14 : inst.kind === 'force_sensor' ? 16 : 12
    const pivot = new THREE.Group()
    const pivotH = 8
    pivot.position.set(0, pivotH, -r.mounts.frontMm)
    this.robotG.add(pivot)
    const parts: THREE.Mesh[] = []
    for (const rect of toolRects(r, inst, 0)) {
      const color = rect.role === 'plate' ? C.toolDark : rect.role === 'jaw' ? C.jaw : rect.role === 'sensor' ? 0xe3242b : rect.role === 'body' ? 0xff9835 : C.tool
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color }))
      pivot.add(m)
      parts.push(m)
    }
    const view: ToolView = { inst, pivot, parts, height }
    this.tools.push(view)
    this.layoutTool(view, def.joint?.restDeg ?? 0)
    if (inst.port && inst.kind !== 'force_sensor') {
      const { sprite, aspect } = this.sprite(inst.port, '#ffffff', '#26327a')
      sprite.scale.set(20 * aspect, 20, 1)
      sprite.position.set(0, height + 22, -8)
      pivot.add(sprite)
    } else if (inst.port) this.portSticker(inst.port, 0, r.mounts.frontMm + 8, 40)
  }

  /** Position a tool's boxes from the shared geometry for the current joint angle. */
  private layoutTool(view: ToolView, jointDeg: number): void {
    const r = this.setup!.robot
    const def = ATTACHMENTS[view.inst.kind]
    const rects = toolRects(r, view.inst, jointDeg)
    const y0 = r.mounts.frontMm
    for (let i = 0; i < view.parts.length && i < rects.length; i++) {
      const rect = rects[i]
      const m = view.parts[i]
      const h = rect.role === 'plate' ? Math.max(view.height, 18) : view.height
      m.scale.set(rect.x1 - rect.x0, h, rect.y1 - rect.y0)
      m.position.set((rect.x0 + rect.x1) / 2, h / 2 - 6, -((rect.y0 + rect.y1) / 2 - y0))
    }
    // lift joints pitch up about the mount edge; passive tools stay flat
    const lifts = def.joint?.type === 'lift' && view.inst.port !== null
    view.pivot.rotation.x = lifts ? jointDeg * DEG : 0
  }

  // ---- scene objects --------------------------------------------------------------------------

  private buildObject(o: SceneObject): THREE.Object3D {
    const def = OBJECT_DEFS[o.type]
    const size = objectSize(o)
    const colorStr = o.color ?? (o.surface ? COLOR_HEX[o.surface] : def.color)
    const color = new THREE.Color(colorStr)
    const g = new THREE.Group()
    const lam = (c: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra })
    const flatMat = (c: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: false })
    switch (o.type) {
      case 'seed_pod_small':
      case 'seed_pod_large': {
        const body = new THREE.Mesh(new THREE.SphereGeometry(size.r, 24, 16), lam(color))
        body.scale.y = size.h / (2 * size.r)
        body.position.y = size.h / 2
        g.add(body)
        const band = new THREE.Mesh(new THREE.TorusGeometry(size.r * 0.99, size.r * 0.06, 8, 28), lam(color.clone().multiplyScalar(0.7)))
        band.rotation.x = Math.PI / 2
        band.position.y = size.h / 2
        g.add(band)
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(size.r * 0.1, size.r * 0.14, size.r * 0.35, 10), lam(0x7a5230))
        stem.position.y = size.h + size.r * 0.12
        g.add(stem)
        const loop = new THREE.Mesh(new THREE.TorusGeometry(size.r * 0.22, size.r * 0.06, 8, 18), lam(0x7a5230))
        loop.position.y = size.h + size.r * 0.42
        g.add(loop)
        break
      }
      case 'ball': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(size.r, 24, 16), lam(color))
        m.position.y = size.r
        g.add(m)
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(size.r * 1.0, size.r * 0.07, 8, 24), lam(0x1b1f2a))
        stripe.position.y = size.r
        g.add(stripe)
        break
      }
      case 'cylinder': {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(size.r, size.r, size.h, 28), lam(color))
        m.position.y = size.h / 2
        g.add(m)
        break
      }
      case 'pull_ring': {
        // a ring lying flat on the mat
        const tube = Math.max(3, size.r * 0.22)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(size.r - tube, tube, 12, 32), lam(color))
        ring.rotation.x = Math.PI / 2
        ring.position.y = tube
        g.add(ring)
        break
      }
      case 'push_bar':
      case 'press_plate': {
        const geo = new THREE.BoxGeometry(size.w, size.h, size.l)
        const m = new THREE.Mesh(geo, lam(color))
        m.position.y = size.h / 2
        g.add(m)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.55) }))
        edges.position.y = size.h / 2
        g.add(edges)
        // the front face (the side the robot comes from) is marked in yellow; in this group it faces +z
        const face = new THREE.Mesh(new THREE.PlaneGeometry(size.w * 0.86, size.h * 0.7), new THREE.MeshBasicMaterial({ color: 0xffd23f }))
        face.position.set(0, size.h / 2, size.l / 2 + 0.6)
        g.add(face)
        break
      }
      case 'box':
      case 'cube':
      case 'obstacle':
      case 'wall': {
        const geo = new THREE.BoxGeometry(size.w, size.h, size.l)
        const m = new THREE.Mesh(geo, lam(color))
        m.position.y = size.h / 2
        g.add(m)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.55) }))
        edges.position.y = size.h / 2
        g.add(edges)
        break
      }
      case 'target_zone': {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(size.r, 40), flatMat(color, 0.3))
        disc.rotation.x = -Math.PI / 2
        disc.position.y = FLAT_Y
        g.add(disc)
        const ring = new THREE.Mesh(new THREE.RingGeometry(size.r - Math.min(10, size.r * 0.15), size.r, 48), flatMat(color))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = FLAT_Y + 0.1
        g.add(ring)
        const dot = new THREE.Mesh(new THREE.CircleGeometry(Math.min(8, size.r * 0.12), 20), flatMat(color))
        dot.rotation.x = -Math.PI / 2
        dot.position.y = FLAT_Y + 0.1
        g.add(dot)
        break
      }
      case 'finish': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.l), flatMat(color, 0.55))
        m.rotation.x = -Math.PI / 2
        m.position.y = FLAT_Y
        g.add(m)
        const pts = [new THREE.Vector3(-size.w / 2, 0, size.l / 2), new THREE.Vector3(size.w / 2, 0, size.l / 2), new THREE.Vector3(size.w / 2, 0, -size.l / 2), new THREE.Vector3(-size.w / 2, 0, -size.l / 2)]
        const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a6a00 }))
        border.position.y = FLAT_Y + 0.2
        g.add(border)
        const { sprite, aspect } = this.sprite('FINISH', '#3b2f00')
        const hMm = Math.min(size.l * 0.3, 44)
        sprite.scale.set(hMm * aspect, hMm, 1)
        sprite.position.y = 2
        g.add(sprite)
        break
      }
      default: {
        // colour patch / line: flat, a colour sensor can see it
        const m = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.l), flatMat(color))
        m.rotation.x = -Math.PI / 2
        m.position.y = FLAT_Y
        g.add(m)
      }
    }
    g.position.set(o.x, 0, -o.y)
    g.rotation.y = -o.rot * DEG
    return g
  }

  private buildObjects(): void {
    clearGroup(this.objectsG)
    this.objectViews.clear()
    for (const o of this.setup?.scene.objects ?? []) {
      if (!OBJECT_DEFS[o.type]) continue
      const node = this.buildObject(o)
      this.objectViews.set(o.id, node)
      this.objectsG.add(node)
    }
  }

  // ---- markers: start, end, trail, distance ticks ---------------------------------------------

  private buildMarkers(): void {
    clearGroup(this.markersG)
    this.trail = null
    this.trailMat = null
    this.trailHead = null
    this.trailPts = []
    this.marks = []
    const s = this.setup
    if (!s) return
    const frames = this.result?.frames ?? []
    const first = frames[0] ?? { x: s.scene.start.x, y: s.scene.start.y, h: s.scene.start.headingDeg * DEG }

    // start: ring + heading arrow
    const start = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.RingGeometry(20, 27, 32), new THREE.MeshBasicMaterial({ color: C.start, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    start.add(ring)
    const tri = new THREE.Shape()
    tri.moveTo(0, 62)
    tri.lineTo(-13, 36)
    tri.lineTo(13, 36)
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: C.start, depthWrite: false }))
    arrow.rotation.x = -Math.PI / 2
    start.add(arrow)
    start.position.set(first.x, MARK_Y - 0.4, -first.y)
    start.rotation.y = -first.h
    this.markersG.add(start)

    if (frames.length < 2) return
    const last = frames[frames.length - 1]

    // end: ghost footprint + flag
    const end = new THREE.Group()
    const ghost = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(this.footprintPoints()), new THREE.LineDashedMaterial({ color: C.end, dashSize: 14, gapSize: 9 }))
    ghost.computeLineDistances()
    end.add(ghost)
    end.position.set(last.x, MARK_Y - 0.2, -last.y)
    end.rotation.y = -last.h
    this.markersG.add(end)
    const flag = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 110, 8), new THREE.MeshLambertMaterial({ color: 0x5a6388 }))
    pole.position.y = 55
    flag.add(pole)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshBasicMaterial({ color: C.end, side: THREE.DoubleSide }))
    cloth.position.set(21, 96, 0)
    flag.add(cloth)
    const base = new THREE.Mesh(new THREE.CircleGeometry(9, 20), new THREE.MeshBasicMaterial({ color: C.end, depthWrite: false }))
    base.rotation.x = -Math.PI / 2
    base.position.y = 0.3
    flag.add(base)
    flag.position.set(last.x, MARK_Y, -last.y)
    this.markersG.add(flag)

    this.trailPts = decimateTrail(frames, 4)
    if (s.settings.trail && this.trailPts.length >= 2) {
      // faint preview of the whole path
      const pts = this.trailPts.map((p) => new THREE.Vector3(p.x, TRAIL_Y - 1, -p.y))
      const preview = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.preview, transparent: true, opacity: 0.45 }))
      this.markersG.add(preview)
      // bright travelled part (screen-space width so it stays visible at any zoom)
      const flatPts: number[] = []
      for (const p of this.trailPts) flatPts.push(p.x, TRAIL_Y, -p.y)
      const geo = new LineGeometry()
      geo.setPositions(flatPts)
      this.trailMat = new LineMaterial({ color: C.trail, linewidth: 4, worldUnits: false })
      this.trailMat.resolution.set(this.width, this.height)
      this.trail = new Line2(geo, this.trailMat)
      this.trail.frustumCulled = false
      this.markersG.add(this.trail)
    }
    if (s.settings.trail) {
      const headGeo = new LineGeometry()
      headGeo.setPositions([0, TRAIL_Y, 0, 0, TRAIL_Y, 0.001])
      const headMat = new LineMaterial({ color: C.trail, linewidth: 4, worldUnits: false })
      headMat.resolution.set(this.width, this.height)
      this.trailHead = new Line2(headGeo, headMat)
      this.trailHead.frustumCulled = false
      this.markersG.add(this.trailHead)
    }

    if (s.settings.distanceMarkers) {
      for (const mark of distanceMarks(frames, s.settings.gridMajorMm)) {
        const node = new THREE.Group()
        const dot = new THREE.Mesh(new THREE.CircleGeometry(7, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }))
        dot.rotation.x = -Math.PI / 2
        node.add(dot)
        const edge = new THREE.Mesh(new THREE.RingGeometry(6, 9, 20), new THREE.MeshBasicMaterial({ color: C.trail, depthWrite: false }))
        edge.rotation.x = -Math.PI / 2
        edge.position.y = 0.1
        node.add(edge)
        const text = `${round(mmToDisplay(mark.pathMm, s.settings.unit), 1)}`
        const { sprite, aspect } = this.sprite(text, '#ffffff', '#c2189a')
        const hMm = Math.min(30, s.settings.gridMajorMm * 0.26)
        sprite.scale.set(hMm * aspect, hMm, 1)
        sprite.position.set(hMm * 0.9, 6, -hMm * 0.7)
        node.add(sprite)
        node.position.set(mark.x, TRAIL_Y + 0.6, -mark.y)
        this.markersG.add(node)
        this.marks.push({ mark, node })
      }
    }
  }

  // ---- per-frame state ------------------------------------------------------------------------

  private applyFrame(): void {
    const s = this.setup
    if (!s) return
    const f = this.currentFrame()
    const pose = this.robotPose()
    this.robotG.position.set(pose.x, 0, -pose.y)
    this.robotG.rotation.y = -pose.h

    const d = s.robot.drive
    // a wheel rolling forward (towards three -z) turns about -x
    if (this.wheelL) this.wheelL.rotation.x = -((f?.motors[d.left.port] ?? 0) * d.left.polarity * s.robot.gearRatio) * DEG
    if (this.wheelR) this.wheelR.rotation.x = -((f?.motors[d.right.port] ?? 0) * d.right.polarity * s.robot.gearRatio) * DEG

    for (const t of this.tools) {
      const joint = f?.joints[t.inst.uid] ?? ATTACHMENTS[t.inst.kind].joint?.restDeg ?? 0
      this.layoutTool(t, joint)
    }
    for (const sv of this.sensors) {
      const reading = f?.sensors[sv.inst.uid]
      if (sv.cone) {
        const hex = typeof reading === 'string' ? COLOR_HEX[reading as ColorName] : undefined
        ;(sv.cone.material as THREE.MeshBasicMaterial).color.set(hex ?? '#ffffff')
      }
      if (sv.ray) {
        const mm = typeof reading === 'number' ? reading : null
        sv.ray.visible = mm !== null && mm < 2000
        if (mm !== null) {
          const y0 = s.robot.mounts.frontMm
          sv.ray.scale.set(1, Math.max(1, mm), 1)
          sv.ray.position.set(0, 12, -(y0 + mm / 2))
        }
      }
    }
    if (this.matrixMat) {
      const map = f?.light ? this.matrixOn : this.matrixOff
      if (this.matrixMat.map !== map) {
        this.matrixMat.map = map
        this.matrixMat.needsUpdate = true
      }
    }

    // objects: positions come from the snapshot (scene values before the first run)
    const seen = new Set<string>()
    for (const o of f?.objects ?? []) {
      const node = this.objectViews.get(o.id)
      if (!node) continue
      seen.add(o.id)
      node.position.set(o.x, o.z, -o.y)
      node.rotation.y = -o.rot
    }
    for (const o of s.scene.objects) {
      if (seen.has(o.id)) continue
      const node = this.objectViews.get(o.id)
      if (!node) continue
      node.position.set(o.x, 0, -o.y)
      node.rotation.y = -o.rot * DEG
    }

    // trail up to the current frame, plus an exact head segment to the robot centre
    const count = trailCountAt(this.trailPts, this.frameIndex)
    if (this.trail) {
      this.trail.visible = count >= 2
      this.trail.geometry.instanceCount = Math.max(0, count - 1)
    }
    if (this.trailHead) {
      const lastPt = count > 0 ? this.trailPts[count - 1] : null
      const moved = lastPt && Math.hypot(pose.x - lastPt.x, pose.y - lastPt.y) > 0.01
      this.trailHead.visible = !!moved
      if (lastPt && moved) (this.trailHead.geometry as LineGeometry).setPositions([lastPt.x, TRAIL_Y, -lastPt.y, pose.x, TRAIL_Y, -pose.y])
    }
    for (const m of this.marks) m.node.visible = m.mark.frame <= this.frameIndex
  }
}
