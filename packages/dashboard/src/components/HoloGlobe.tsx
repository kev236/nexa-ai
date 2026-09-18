'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Purely decorative — a rotating wireframe globe with a Fresnel
 * atmosphere rim, a layered node/constellation mesh, and a static
 * starfield for depth, rendered as the Command Center page's own
 * background (see .page-globe-bg in globals.css). Runs entirely
 * client-side via WebGL, so unlike every model discussed this session
 * it has zero server/API cost: no GPU host, no per-render charge,
 * just the visitor's own browser.
 *
 * Colors are read from the page's own CSS custom properties at mount
 * time rather than hardcoded, so this stays in sync with the design
 * system's --accent/--accent-strong/--accent-blue instead of drifting
 * from them.
 */
export function HoloGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const styles = getComputedStyle(document.documentElement)
    const accent = new THREE.Color(styles.getPropertyValue('--accent').trim() || '#8b5cf6')
    const accentStrong = new THREE.Color(styles.getPropertyValue('--accent-strong').trim() || '#7c3aed')
    const accentBlue = new THREE.Color(styles.getPropertyValue('--accent-blue').trim() || '#3b82f6')

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.z = 3.1

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // A sparse field of distant points well outside the globe itself —
    // gives the scene actual depth (something for the globe to be the
    // center *of*) instead of one object floating on flat transparency.
    // Static, not part of globeGroup, so it doesn't spin with the globe.
    const STAR_COUNT = 220
    const starPositions = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const radius = 3.2 + Math.random() * 4.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      starPositions[i * 3 + 2] = radius * Math.cos(phi)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: accent,
      size: 0.012,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const starField = new THREE.Points(starGeometry, starMaterial)
    scene.add(starField)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)

    // Wireframe shell — the globe's silhouette. Finer segments than a
    // decorative icon needs, since this now renders large enough (a
    // real viewport-scale background) that low-poly faceting would show.
    const wireGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 32, 24))
    const wireMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.4 })
    globeGroup.add(new THREE.LineSegments(wireGeometry, wireMaterial))

    // Fresnel-style atmosphere rim — brighter at the grazing edge than
    // face-on, the standard cheap trick for a "glowing planet" look
    // (view-dependent intensity via the vertex normal vs. view
    // direction, no lights or postprocessing pass needed).
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: accentStrong } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 5.0);
          gl_FragColor = vec4(glowColor, clamp(intensity, 0.0, 1.0) * 0.4);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    })
    const atmosphereGeometry = new THREE.SphereGeometry(1.14, 32, 24)
    globeGroup.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

    // Soft inner fill underneath the atmosphere rim — keeps the sphere's
    // face from reading as fully hollow/flat between the wireframe lines.
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: accentStrong,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    })
    const glowGeometry = new THREE.SphereGeometry(1.05, 32, 24)
    globeGroup.add(new THREE.Mesh(glowGeometry, glowMaterial))

    // Node points scattered evenly over the surface (Fibonacci sphere) —
    // reads as "data" on the globe without claiming to encode anything real.
    const NODE_COUNT = 140
    const nodeVectors: THREE.Vector3[] = []
    const nodePositions = new Float32Array(NODE_COUNT * 3)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < NODE_COUNT; i++) {
      const y = 1 - (i / (NODE_COUNT - 1)) * 2
      const radiusAtY = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i
      const x = Math.cos(theta) * radiusAtY
      const z = Math.sin(theta) * radiusAtY
      nodePositions[i * 3] = x
      nodePositions[i * 3 + 1] = y
      nodePositions[i * 3 + 2] = z
      nodeVectors.push(new THREE.Vector3(x, y, z))
    }
    const nodeGeometry = new THREE.BufferGeometry()
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3))
    const nodeMaterial = new THREE.PointsMaterial({
      color: accent,
      size: 0.022,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    globeGroup.add(new THREE.Points(nodeGeometry, nodeMaterial))

    // A sparser second layer, larger and in the electric-blue accent —
    // reads as a few "highlighted" data points among the rest rather
    // than a uniform dot grid, cheap size/color variance without a
    // custom per-point shader.
    const highlightPositions: number[] = []
    for (let i = 0; i < nodeVectors.length; i += 11) {
      highlightPositions.push(nodeVectors[i].x, nodeVectors[i].y, nodeVectors[i].z)
    }
    const highlightGeometry = new THREE.BufferGeometry()
    highlightGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(highlightPositions), 3))
    const highlightMaterial = new THREE.PointsMaterial({
      color: accentBlue,
      size: 0.04,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    globeGroup.add(new THREE.Points(highlightGeometry, highlightMaterial))

    // Constellation lines — each node joined to its two nearest
    // neighbors, so the surface reads as a connected data mesh rather
    // than loose dust. Computed once at mount (140 points is cheap),
    // never per-frame.
    const linkPositions: number[] = []
    for (let i = 0; i < nodeVectors.length; i++) {
      const distances = nodeVectors
        .map((v, j) => ({ j, d: i === j ? Infinity : v.distanceTo(nodeVectors[i]) }))
        .sort((a, b) => a.d - b.d)
      for (const { j, d } of distances.slice(0, 2)) {
        if (d < 0.45) {
          const a = nodeVectors[i]
          const b = nodeVectors[j]
          linkPositions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
      }
    }
    const linkGeometry = new THREE.BufferGeometry()
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linkPositions), 3))
    const linkMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    globeGroup.add(new THREE.LineSegments(linkGeometry, linkMaterial))

    // Two tilted orbit rings, Saturn-style, plus a brighter, fast partial
    // arc that reads as a radar sweep circling the globe.
    const rings: THREE.Mesh[] = []
    ;[
      { radius: 1.55, tilt: 1.15, tube: 0.004, opacity: 0.35 },
      { radius: 1.85, tilt: 1.35, tube: 0.003, opacity: 0.2 },
    ].forEach(({ radius, tilt, tube, opacity }) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 96),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity })
      )
      ring.rotation.x = tilt
      rings.push(ring)
      scene.add(ring)
    })

    const sweepArc = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.006, 8, 48, Math.PI * 0.6),
      new THREE.MeshBasicMaterial({
        color: accentBlue,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    sweepArc.rotation.x = 0.5
    globeGroup.add(sweepArc)

    function resize() {
      if (!container) return
      const size = container.clientWidth
      if (size === 0) return
      renderer.setSize(size, size)
      camera.aspect = 1
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    // Subtle pointer parallax — the globe leans toward the cursor rather
    // than spinning on a fixed axis alone, so it reads as reactive
    // instead of a looping animation. Purely additive to the base spin;
    // idle (pointer never enters) it behaves exactly as before.
    let pointerX = 0
    let pointerY = 0
    function onPointerMove(event: PointerEvent) {
      if (!container) return
      const rect = container.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }
    if (!reduceMotion) container.addEventListener('pointermove', onPointerMove)

    let frame: number | undefined
    function tick() {
      starField.rotation.y += 0.0003
      globeGroup.rotation.y += 0.0022
      globeGroup.rotation.x += (Math.sin(Date.now() / 8000) * 0.08 + pointerY * 0.18 - globeGroup.rotation.x) * 0.04
      globeGroup.rotation.z += (pointerX * -0.12 - globeGroup.rotation.z) * 0.04
      // A very slow, subtle breathing scale — reads as "alive" rather
      // than a static object with a spinning texture on it.
      const breath = 1 + Math.sin(Date.now() / 4200) * 0.012
      globeGroup.scale.setScalar(breath)
      rings.forEach((ring, i) => {
        ring.rotation.z += i % 2 === 0 ? 0.0016 : -0.0011
      })
      sweepArc.rotation.z += 0.01
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }

    if (reduceMotion) {
      renderer.render(scene, camera)
    } else {
      tick()
    }

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      container.removeEventListener('pointermove', onPointerMove)
      starGeometry.dispose()
      starMaterial.dispose()
      wireGeometry.dispose()
      wireMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      glowGeometry.dispose()
      glowMaterial.dispose()
      nodeGeometry.dispose()
      nodeMaterial.dispose()
      highlightGeometry.dispose()
      highlightMaterial.dispose()
      linkGeometry.dispose()
      linkMaterial.dispose()
      sweepArc.geometry.dispose()
      ;(sweepArc.material as THREE.Material).dispose()
      rings.forEach((ring) => {
        ring.geometry.dispose()
        ;(ring.material as THREE.Material).dispose()
      })
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={containerRef} className="holo-globe" aria-hidden />
}
