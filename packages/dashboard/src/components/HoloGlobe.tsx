'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Purely decorative — a rotating wireframe globe behind the reactor
 * core's real data (agent nodes, pending count; see page.tsx). Runs
 * entirely client-side via WebGL, so unlike every model discussed this
 * session it has zero server/API cost: no GPU host, no per-render
 * charge, just the visitor's own browser.
 *
 * Colors are read from the page's own CSS custom properties at mount
 * time rather than hardcoded, so this stays in sync with the design
 * system's --accent/--accent-strong instead of drifting from it.
 */
export function HoloGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const styles = getComputedStyle(document.documentElement)
    const accent = new THREE.Color(styles.getPropertyValue('--accent').trim() || '#a78bfa')
    const accentStrong = new THREE.Color(styles.getPropertyValue('--accent-strong').trim() || '#8b5cf6')

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.z = 3.1

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)

    // Wireframe shell — the globe's silhouette.
    const wireGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 20, 14))
    const wireMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.45 })
    globeGroup.add(new THREE.LineSegments(wireGeometry, wireMaterial))

    // Soft inner fill — approximates a glow without a full bloom pass.
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: accentStrong,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
    })
    globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18), glowMaterial))

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
        color: accentStrong,
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
      globeGroup.rotation.y += 0.0022
      globeGroup.rotation.x += (Math.sin(Date.now() / 8000) * 0.08 + pointerY * 0.18 - globeGroup.rotation.x) * 0.04
      globeGroup.rotation.z += (pointerX * -0.12 - globeGroup.rotation.z) * 0.04
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
      wireGeometry.dispose()
      wireMaterial.dispose()
      glowMaterial.dispose()
      nodeGeometry.dispose()
      nodeMaterial.dispose()
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
