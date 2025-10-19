import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { DefaultTunnel } from './tunnelConfig'
import './tunnelSandbox.css'

const WALK_SPEED = 20
const SLOT_SPACING = 9

function createImageTexture(index) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const hues = [190, 320, 60, 120, 260]
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  const hue = hues[index % hues.length]
  gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`)
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, 70%, 45%)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(30, 40, size - 60, size - 80)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.font = 'bold 60px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`#${(index + 1).toString().padStart(2, '0')}`, size / 2, size / 2)
  return new THREE.CanvasTexture(canvas)
}

function buildSlotPositions(baseSlots) {
  return baseSlots.map((slot, index) => {
    const isLeft = index % 2 === 0
    const z = -14 - index * SLOT_SPACING
    const x = isLeft ? -3.2 : 3.2
    const rotationY = isLeft ? Math.PI / 2.15 : -Math.PI / 2.15
    return {
      id: slot.id,
      position: [x, 1.9, z],
      rotation: [0, rotationY, 0],
      scale: [4.2, 3.2, 1],
    }
  })
}

function loadTexture(url, loader) {
  const href = new URL(url, import.meta.url).href
  return loader.load(href)
}

function TunnelSandbox({ onExit }) {
  const canvasRef = useRef(null)
  const controlsRef = useRef(null)
  const [isLocked, setIsLocked] = useState(false)
  const [instructionsVisible, setInstructionsVisible] = useState(true)

  const slotBlueprint = useMemo(() => buildSlotPositions(DefaultTunnel.slots), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.dither = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.physicallyCorrectLights = true
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500)
    camera.position.set(0, 2, 12)
    camera.up.set(0, 1, 0)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#040712')

    const ambient = new THREE.HemisphereLight(0xf8fbff, 0x1b2242, 1.05)
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(0xffffff, 0.85)
    directional.position.set(3, 12, 8)
    directional.castShadow = true
    directional.shadow.mapSize.set(1024, 1024)
    directional.shadow.camera.left = -20
    directional.shadow.camera.right = 20
    directional.shadow.camera.top = 20
    directional.shadow.camera.bottom = -20
    scene.add(directional)

    const spotlight = new THREE.SpotLight(0xe4ecff, 2.8, 60, Math.PI / 8, 0.35, 1.5)
    spotlight.castShadow = true
    spotlight.shadow.mapSize.set(1024, 1024)
    spotlight.position.set(0, 14, -20)
    spotlight.target.position.set(0, 0, -40)
    scene.add(spotlight.target)
    scene.add(spotlight)

    const loader = new THREE.TextureLoader()
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    new RGBELoader().load(new URL('./hdr/dreamy.hdr', import.meta.url).href, (hdr) => {
      const envMap = pmrem.fromEquirectangular(hdr).texture
      scene.environment = envMap
      hdr.dispose?.()
    }, undefined, () => {
      // if load fails, skip env lighting gracefully
    })
    
    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.45,
      0.6,
      0.86,
    )
    composer.addPass(renderPass)
    composer.addPass(bloomPass)

    const baseColor = loadTexture('./pathTexture/Marble012_4K-JPG_Color.jpg', loader)
    baseColor.colorSpace = THREE.SRGBColorSpace
    const normalMap = loadTexture('./pathTexture/Marble012_4K-JPG_NormalGL.jpg', loader)
    const roughnessMap = loadTexture('./pathTexture/Marble012_4K-JPG_Roughness.jpg', loader)
    const aoMap = null
    let dispMap
    try {
      dispMap = loadTexture('./pathTexture/Marble012_4K-JPG_Displacement.jpg', loader)
    } catch (error) {
      dispMap = null
    }

    const textures = [baseColor, normalMap, roughnessMap, aoMap, dispMap].filter(Boolean)
    textures.forEach((tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(3.2, 40)
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    })

    const pathMaterial = new THREE.MeshPhysicalMaterial({
      map: baseColor,
      normalMap,
      roughnessMap,
      metalness: 0,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.8,
      displacementMap: dispMap || undefined,
      displacementScale: dispMap ? 0.012 : 0,
    })

    const pathGeometry = new THREE.PlaneGeometry(4.6, 200, 200, 200)
    const uv2 = pathGeometry.attributes.uv.array.slice(0)
    pathGeometry.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2))
    const path = new THREE.Mesh(pathGeometry, pathMaterial)
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0, -90)
    path.receiveShadow = true
    scene.add(path)

    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x111627,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
    })
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 200), edgeMaterial)
    edge.rotation.x = -Math.PI / 2
    edge.position.set(0, 0.015, -90)
    scene.add(edge)

    const fog = new THREE.FogExp2(0x050910, 0.012)
    scene.fog = fog

    const stars = new THREE.BufferGeometry()
    const starVertices = []
    const starColors = []
    for (let i = 0; i < 2200; i += 1) {
      const radius = 140 * (0.6 + Math.random() * 0.4)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos((Math.random() * 2) - 1)
      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta)
      const z = radius * Math.cos(phi) - 70
      starVertices.push(x, y, z)

      const hue = 180 + Math.random() * 120
      const sat = 70 + Math.random() * 20
      const light = 75 + Math.random() * 15
      const color = new THREE.Color(`hsl(${hue}, ${sat}%, ${light}%)`)
      starColors.push(color.r, color.g, color.b)
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3))
    stars.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3))
    const starMaterial = new THREE.PointsMaterial({
      size: 0.65,
      transparent: true,
      opacity: 0.88,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    })
    const starField = new THREE.Points(stars, starMaterial)
    scene.add(starField)

    const imageGeometry = new THREE.PlaneGeometry(4, 3)
    const floats = []
    slotBlueprint.forEach((slot, index) => {
      const texture = createImageTexture(index)
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

      const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0x0c1121,
        emissive: 0x141f33,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      })
      const frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.35, 3.35), frameMaterial)
      frameMesh.position.set(slot.position[0], slot.position[1], slot.position[2])
      frameMesh.rotation.set(0, slot.rotation[1], 0)
      frameMesh.castShadow = true
      scene.add(frameMesh)

      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(imageGeometry, material)
      mesh.position.set(slot.position[0], slot.position[1], slot.position[2] + 0.015 * (slot.position[0] > 0 ? -1 : 1))
      mesh.rotation.set(0, slot.rotation[1], 0)
      mesh.castShadow = true
      scene.add(mesh)

      floats.push({
        mesh,
        origin: mesh.position.clone(),
        axis: new THREE.Vector3(0.15 + Math.random() * 0.25, 1, 0.2 + Math.random() * 0.2).normalize(),
        speed: 0.22 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        amplitude: 0.28 + Math.random() * 0.18,
      })
    })

    const controls = new PointerLockControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.pointerSpeed = 0.6
    controls.minPolarAngle = THREE.MathUtils.degToRad(15)
    controls.maxPolarAngle = THREE.MathUtils.degToRad(165)
    controls.addEventListener('lock', () => {
      setIsLocked(true)
      setInstructionsVisible(false)
    })
    controls.addEventListener('unlock', () => {
      setIsLocked(false)
      setInstructionsVisible(true)
    })
    const rig = controls.getObject()
    scene.add(rig)
    camera.rotation.order = "YXZ"
    const pitchObject = rig.children?.[0]
    const MIN_PITCH = -Math.PI / 2 + 0.01
    const MAX_PITCH = Math.PI / 2 - 0.01

    rig.position.set(0, 1.8, -4)

    const moveState = { forward: false, back: false, left: false, right: false }
    const onKeyDown = (event) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveState.forward = true
          break
        case 'ArrowLeft':
        case 'KeyA':
          moveState.left = true
          break
        case 'ArrowDown':
        case 'KeyS':
          moveState.back = true
          break
        case 'ArrowRight':
        case 'KeyD':
          moveState.right = true
          break
        default:
      }
    }
    const onKeyUp = (event) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveState.forward = false
          break
        case 'ArrowLeft':
        case 'KeyA':
          moveState.left = false
          break
        case 'ArrowDown':
        case 'KeyS':
          moveState.back = false
          break
        case 'ArrowRight':
        case 'KeyD':
          moveState.right = false
          break
        default:
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    const clock = new THREE.Clock()
    const velocity = new THREE.Vector3()
    const direction = new THREE.Vector3()

    const resize = () => {
      const { clientWidth, clientHeight } = canvas.parentElement || document.body
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      composer.setSize(clientWidth, clientHeight)
      bloomPass.setSize(clientWidth, clientHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.1)
      const elapsed = clock.getElapsedTime()
      velocity.x -= velocity.x * 8.0 * delta
      velocity.z -= velocity.z * 8.0 * delta

      direction.z = Number(moveState.back) - Number(moveState.forward)
      direction.x = Number(moveState.left) - Number(moveState.right)
      direction.normalize()

      if (controls.isLocked) {
        velocity.z -= direction.z * WALK_SPEED * delta
        velocity.x -= direction.x * WALK_SPEED * delta

        controls.moveRight(velocity.x * delta)
        controls.moveForward(velocity.z * delta)
        const position = rig.position
        position.x = THREE.MathUtils.clamp(position.x, -3.4, 3.4)
        position.y = THREE.MathUtils.clamp(position.y, 1.6, 2.4)
      }

      const bob = 0.03 * Math.sin(elapsed * 0.6)
      camera.position.y = 2 + bob

      if (pitchObject) {
        pitchObject.rotation.x = THREE.MathUtils.clamp(pitchObject.rotation.x, MIN_PITCH, MAX_PITCH)
      }

      camera.rotation.z = 0

      if (pathMaterial.clearcoatRoughness !== undefined) {
        pathMaterial.clearcoatRoughness = 0.04 + 0.02 * Math.sin(elapsed * 0.25)
        pathMaterial.envMapIntensity = 1.6 + 0.3 * Math.sin(elapsed * 0.2)
      }

      floats.forEach((float) => {
        const { mesh, origin, axis, speed, phase, amplitude } = float
        const t = elapsed * speed + phase
        const offset = axis.clone().multiplyScalar(Math.sin(t) * amplitude)
        mesh.position.copy(origin).add(offset)
      })

      starMaterial.opacity = 0.82 + 0.06 * Math.sin(elapsed * 0.2)

      composer.render()
    }
    renderer.setAnimationLoop(animate)

    const dispose = () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      renderer.setAnimationLoop(null)
      if (controls.isLocked) controls.unlock()
      controls.dispose()
      renderer.dispose()
      composer.dispose?.()
      bloomPass.dispose?.()
      pmrem.dispose?.()
      scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.()
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat?.map?.dispose?.() || mat?.dispose?.())
          } else {
            child.material?.map?.dispose?.()
            child.material?.dispose?.()
          }
        }
      })
    }

    return dispose
  }, [slotBlueprint])

  return (
    <div className="sandbox-shell">
      <header className="sandbox-header">
        <div>
          <h1>Tunnel Sandbox</h1>
          <p>Click into the viewport to lock the pointer. Use WASD or arrow keys to walk the floating path.</p>
        </div>
        <button type="button" onClick={onExit} className="sandbox-return">
          Return to Site
        </button>
      </header>

      <section className="sandbox-stage">
        <canvas ref={canvasRef} className="sandbox-canvas" />
        {instructionsVisible && (
          <div className="sandbox-instructions" onClick={() => controlsRef.current?.lock?.()}>
            <div className="sandbox-instructions-card">
              <h2>Enter Sandbox</h2>
              <p>Click to start. Then use WASD / Arrow keys to move along the cobblestone path.</p>
              <button type="button" className="sandbox-enter" onClick={() => controlsRef.current?.lock?.()}>
                Click to Begin
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default TunnelSandbox
