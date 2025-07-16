import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import styles from './Game.module.css'

const PLAYER_WIDTH = 0.5
const PLAYER_HEIGHT = 1
const PLAYER_COLOR = 0x00fffc

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene>(null)
  const playerRef = useRef<THREE.Mesh>(null)
  const bulletsRef = useRef<THREE.Mesh[]>([])
  const enemiesRef = useRef<THREE.Mesh[]>([])
  const enemyBulletsRef = useRef<THREE.Mesh[]>([])
  const moveRef = useRef<{
    left: boolean
    right: boolean
    up: boolean
    down: boolean
  }>({
    left: false,
    right: false,
    up: false,
    down: false,
  })
  const rendererRef = useRef<THREE.WebGLRenderer>(null)
  const cameraRef = useRef<THREE.OrthographicCamera>(null)
  const leftCrackRef = useRef<THREE.Mesh>(null)
  const rightCrackRef = useRef<THREE.Mesh>(null)

  // --- Audio ---
  const shootAudio = useRef<HTMLAudioElement | null>(null)
  const explosionAudio = useRef<HTMLAudioElement | null>(null)

  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [gameOver, setGameOver] = useState(false)
  const [canvasSize, setCanvasSize] = useState({
    width: Math.floor(window.innerWidth * 0.7),
    height: window.innerHeight,
  })
  const [highScore, setHighScore] = useState(() => {
    return Number(localStorage.getItem('highScore') || 0)
  })

  // --- Constants for starfield ---
  const STAR_COLOR = 0xffffff
  const STAR_COUNT = 80
  const STAR_MIN_SIZE = 0.03
  const STAR_MAX_SIZE = 0.09

  function handleRestart() {
    setScore(0)
    setLives(3)
    setGameOver(false)
  }

  // --- Resize handler ---
  useEffect(() => {
    function handleResize() {
      setCanvasSize({
        width: Math.floor(window.innerWidth * 0.7),
        height: window.innerHeight,
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('highScore', String(score))
    }
  }, [score, highScore])

  useEffect(() => {
    // --- Create renderer only once ---
    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({ antialias: true })
      rendererRef.current.domElement.style.display = 'block'
      rendererRef.current.setSize(canvasSize.width, canvasSize.height)
      rendererRef.current.setClearColor('#0a0a2a')
      if (mountRef.current) {
        mountRef.current.appendChild(rendererRef.current.domElement)
      }
    }
    // --- Update renderer size on resize ---
    rendererRef.current.setSize(canvasSize.width, canvasSize.height)
  }, [canvasSize])

  useEffect(() => {
    if (gameOver) return
    // --- Scene ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a2a)
    sceneRef.current = scene

    // --- Camera ---
    const viewHeight = 10
    const aspect = canvasSize.width / canvasSize.height
    const viewWidth = viewHeight * aspect
    const camera = new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      100
    )
    camera.position.z = 10
    cameraRef.current = camera

    // --- Add stars ---
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = Math.random() * (STAR_MAX_SIZE - STAR_MIN_SIZE) + STAR_MIN_SIZE
      const starGeometry = new THREE.CircleGeometry(r, 8)
      const starMaterial = new THREE.MeshBasicMaterial({ color: STAR_COLOR })
      const star = new THREE.Mesh(starGeometry, starMaterial)
      star.position.x = Math.random() * viewWidth - viewWidth / 2
      star.position.y = Math.random() * viewHeight - viewHeight / 2
      star.position.z = -2
      scene.add(star)
    }

    // --- Player (ship) ---
    const playerGeometry = new THREE.ConeGeometry(
      PLAYER_WIDTH,
      PLAYER_HEIGHT * 1.5,
      3
    )
    const playerMaterial = new THREE.MeshBasicMaterial({ color: PLAYER_COLOR })
    const player = new THREE.Mesh(playerGeometry, playerMaterial)
    player.position.y = -4
    // Without rotation - sharp end down (like enemies before)
    scene.add(player)
    playerRef.current = player

    // --- Wings (closer to ship body) ---
    const wingMaterial = new THREE.MeshBasicMaterial({
      color: 0x0099cc,
      side: THREE.DoubleSide,
    })
    // Left wing triangle (ближче до корабля)
    const leftWingGeometry = new THREE.BufferGeometry()
    const leftWingVertices = new Float32Array([
      0,
      0,
      0, // біля корабля
      -PLAYER_WIDTH * 1.5,
      -PLAYER_HEIGHT * 1.2,
      0, // далекий кут
      -PLAYER_WIDTH * 0.4,
      -PLAYER_HEIGHT * 0.25,
      0, // ближній кут
    ])
    leftWingGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(leftWingVertices, 3)
    )
    leftWingGeometry.computeVertexNormals()
    const leftWing = new THREE.Mesh(leftWingGeometry, wingMaterial)
    leftWing.position.set(
      -PLAYER_WIDTH * 0.4,
      player.position.y - PLAYER_HEIGHT * 0.1,
      0.05
    )
    scene.add(leftWing)
    // Right wing triangle (ближче до корабля)
    const rightWingGeometry = new THREE.BufferGeometry()
    const rightWingVertices = new Float32Array([
      0,
      0,
      0,
      PLAYER_WIDTH * 1.5,
      -PLAYER_HEIGHT * 1.2,
      0,
      PLAYER_WIDTH * 0.4,
      -PLAYER_HEIGHT * 0.25,
      0,
    ])
    rightWingGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(rightWingVertices, 3)
    )
    rightWingGeometry.computeVertexNormals()
    const rightWing = new THREE.Mesh(rightWingGeometry, wingMaterial)
    rightWing.position.set(
      PLAYER_WIDTH * 0.4,
      player.position.y - PLAYER_HEIGHT * 0.1,
      0.05
    )
    scene.add(rightWing)

    // --- Side cannons in the middle of wings (elliptical) ---
    // Середня точка крила: (0 + (-PLAYER_WIDTH * 1.5)) / 2 = -PLAYER_WIDTH * 0.75
    const leftCannonX = -PLAYER_WIDTH * 0.75 + -PLAYER_WIDTH * 0.4
    const leftCannonY =
      player.position.y - PLAYER_HEIGHT * 0.1 - PLAYER_HEIGHT * 0.6
    const rightCannonX = PLAYER_WIDTH * 0.75 + PLAYER_WIDTH * 0.4
    const rightCannonY =
      player.position.y - PLAYER_HEIGHT * 0.1 - PLAYER_HEIGHT * 0.6
    // Еліптичні пушки з CapsuleGeometry
    const cannonGeometry = new THREE.CapsuleGeometry(0.06, 0.4, 8, 16)
    const cannonMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 })
    const leftCannon = new THREE.Mesh(cannonGeometry, cannonMaterial)
    leftCannon.position.set(leftCannonX, leftCannonY, 0.18)
    leftCannon.scale.set(1.8, 1, 1) // Робимо еліптичними
    scene.add(leftCannon)
    const rightCannon = new THREE.Mesh(cannonGeometry, cannonMaterial)
    rightCannon.position.set(rightCannonX, rightCannonY, 0.18)
    rightCannon.scale.set(1.8, 1, 1) // Робимо еліптичними
    scene.add(rightCannon)

    // --- Flame under the ship ---
    const flameGeometry = new THREE.ConeGeometry(0.25, 0.7, 12)
    const flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa500,
      transparent: true,
      opacity: 0.85,
    })
    const flame = new THREE.Mesh(flameGeometry, flameMaterial)
    flame.position.y = player.position.y - PLAYER_HEIGHT * 0.9
    flame.position.x = player.position.x
    flame.position.z = player.position.z - 0.1
    flame.rotation.x = Math.PI // Flame points down
    scene.add(flame)

    // --- Ship damage cracks (visible when lives = 1) ---
    const crackMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 1.0,
    })

    // Left crack
    const leftCrackGeometry = new THREE.BufferGeometry()
    const leftCrackVertices = new Float32Array([
      0,
      PLAYER_HEIGHT * 0.4,
      0.01,
      -PLAYER_WIDTH * 0.4,
      PLAYER_HEIGHT * 0.2,
      0.01,
      -PLAYER_WIDTH * 0.3,
      -PLAYER_HEIGHT * 0.3,
      0.01,
      0,
      -PLAYER_HEIGHT * 0.5,
      0.01,
    ])
    leftCrackGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(leftCrackVertices, 3)
    )
    leftCrackGeometry.computeVertexNormals()
    const leftCrack = new THREE.Mesh(leftCrackGeometry, crackMaterial)
    leftCrack.visible = false // Початково невидимі
    scene.add(leftCrack)
    leftCrackRef.current = leftCrack

    // Right crack
    const rightCrackGeometry = new THREE.BufferGeometry()
    const rightCrackVertices = new Float32Array([
      0,
      PLAYER_HEIGHT * 0.4,
      0.01,
      PLAYER_WIDTH * 0.4,
      PLAYER_HEIGHT * 0.2,
      0.01,
      PLAYER_WIDTH * 0.3,
      -PLAYER_HEIGHT * 0.3,
      0.01,
      0,
      -PLAYER_HEIGHT * 0.5,
      0.01,
    ])
    rightCrackGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(rightCrackVertices, 3)
    )
    rightCrackGeometry.computeVertexNormals()
    const rightCrack = new THREE.Mesh(rightCrackGeometry, crackMaterial)
    rightCrack.visible = false // Початково невидимі
    scene.add(rightCrack)
    rightCrackRef.current = rightCrack

    // --- Bullet params ---
    const BULLET_WIDTH = 0.3
    const BULLET_HEIGHT = 0.8
    const BULLET_COLOR = 0xff0000
    const BULLET_SPEED = 0.2

    // --- Enemy bullet params ---
    const ENEMY_BULLET_WIDTH = 0.25
    const ENEMY_BULLET_HEIGHT = 0.6
    const ENEMY_BULLET_COLOR = 0xff4444
    const ENEMY_BULLET_SPEED = 0.08

    // --- Enemies ---
    const ENEMY_WIDTH = 0.5
    const ENEMY_HEIGHT = 0.9
    const ENEMY_COLOR = 0x2222ff
    const ENEMY_SPEED = 0.04
    enemiesRef.current = []
    enemyBulletsRef.current = []

    // --- Explosions ---
    const explosions: { mesh: THREE.Mesh; timer: number }[] = []

    // Add enemy every 1.5 seconds
    const enemyInterval = setInterval(() => {
      const scene = sceneRef.current
      if (!scene) return
      const enemyGeometry = new THREE.ConeGeometry(
        ENEMY_WIDTH,
        ENEMY_HEIGHT * 1.5,
        3
      )
      const enemyMaterial = new THREE.MeshBasicMaterial({ color: ENEMY_COLOR })
      const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial)
      enemy.rotation.x = Math.PI // Sharp end down
      const leftBound = -viewWidth / 2 + ENEMY_WIDTH / 2
      const rightBound = viewWidth / 2 - ENEMY_WIDTH / 2
      enemy.position.x = Math.random() * (rightBound - leftBound) + leftBound
      enemy.position.y = 5 + ENEMY_HEIGHT / 2
      enemy.position.z = 0.5
      scene.add(enemy)
      enemiesRef.current.push(enemy)
    }, 1500)

    // Enemy shooting interval
    const enemyShootInterval = setInterval(() => {
      const scene = sceneRef.current
      const enemies = enemiesRef.current
      const enemyBullets = enemyBulletsRef.current
      if (!scene || enemies.length === 0) return

      // Random enemy shoots
      const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)]
      if (randomEnemy && randomEnemy.position.y < 4) {
        const enemyBulletGeometry = new THREE.CircleGeometry(
          ENEMY_BULLET_WIDTH / 2,
          16
        )
        enemyBulletGeometry.scale(
          1,
          ENEMY_BULLET_HEIGHT / ENEMY_BULLET_WIDTH,
          1
        )
        const enemyBulletMaterial = new THREE.MeshBasicMaterial({
          color: ENEMY_BULLET_COLOR,
        })
        const enemyBullet = new THREE.Mesh(
          enemyBulletGeometry,
          enemyBulletMaterial
        )
        enemyBullet.position.x = randomEnemy.position.x
        enemyBullet.position.y =
          randomEnemy.position.y - ENEMY_HEIGHT / 2 - ENEMY_BULLET_HEIGHT / 2
        enemyBullet.position.z = 0.5
        scene.add(enemyBullet)
        enemyBullets.push(enemyBullet)
      }
    }, 2000)

    // --- Player control ---
    moveRef.current = { left: false, right: false, up: false, down: false }
    const speed = 0.15
    const leftBound = -viewWidth / 2 + PLAYER_WIDTH / 2
    const rightBound = viewWidth / 2 - PLAYER_WIDTH / 2
    // For the new coordinate system:
    // const leftBound = -viewWidth / 2 + PLAYER_WIDTH / 2;
    // const rightBound = viewWidth / 2 - PLAYER_WIDTH / 2;

    function shoot() {
      const scene = sceneRef.current
      const bullets = bulletsRef.current
      const player = playerRef.current
      if (!scene || !player) return
      // --- Triple elliptical bullets: 2 from wings + 1 from center ---
      const bulletGeometry = new THREE.CircleGeometry(BULLET_WIDTH / 2, 24)
      bulletGeometry.scale(1, BULLET_HEIGHT / BULLET_WIDTH, 1)
      const bulletMaterial = new THREE.MeshBasicMaterial({
        color: BULLET_COLOR,
      })
      // Left bullet from wing
      const leftBullet = new THREE.Mesh(bulletGeometry.clone(), bulletMaterial)
      leftBullet.position.x =
        player.position.x - PLAYER_WIDTH * 0.75 + -PLAYER_WIDTH * 0.4
      leftBullet.position.y =
        player.position.y -
        PLAYER_HEIGHT * 0.1 -
        PLAYER_HEIGHT * 0.6 +
        PLAYER_HEIGHT * 0.5
      leftBullet.position.z = 0.5
      scene.add(leftBullet)
      bullets.push(leftBullet)
      // Right bullet from wing
      const rightBullet = new THREE.Mesh(bulletGeometry.clone(), bulletMaterial)
      rightBullet.position.x =
        player.position.x + PLAYER_WIDTH * 0.75 + PLAYER_WIDTH * 0.4
      rightBullet.position.y =
        player.position.y -
        PLAYER_HEIGHT * 0.1 -
        PLAYER_HEIGHT * 0.6 +
        PLAYER_HEIGHT * 0.5
      rightBullet.position.z = 0.5
      scene.add(rightBullet)
      bullets.push(rightBullet)
      // Center bullet from ship's nose
      const centerBullet = new THREE.Mesh(
        bulletGeometry.clone(),
        bulletMaterial
      )
      centerBullet.position.x = player.position.x
      centerBullet.position.y =
        player.position.y + PLAYER_HEIGHT / 2 + BULLET_HEIGHT / 2
      centerBullet.position.z = 0.5
      scene.add(centerBullet)
      bullets.push(centerBullet)
      // --- Play shoot sound (new Audio every time) ---
      const sfx = new window.Audio('/sounds/shoot.mp3')
      sfx.volume = 0.5
      sfx.play()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A')
        moveRef.current.left = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')
        moveRef.current.right = true
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')
        moveRef.current.up = true
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')
        moveRef.current.down = true
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        shoot()
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A')
        moveRef.current.left = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')
        moveRef.current.right = false
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')
        moveRef.current.up = false
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')
        moveRef.current.down = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // --- Animation ---
    let running = true
    function animate() {
      if (!running) return
      const bullets = bulletsRef.current
      const enemies = enemiesRef.current
      // --- Player movement ---
      if (moveRef.current.left) playerRef.current!.position.x -= speed
      if (moveRef.current.right) playerRef.current!.position.x += speed
      if (moveRef.current.up) playerRef.current!.position.y += speed
      if (moveRef.current.down) playerRef.current!.position.y -= speed
      playerRef.current!.position.x = Math.max(
        leftBound,
        Math.min(rightBound, playerRef.current!.position.x)
      )
      // Y bounds
      const topBound = viewHeight / 2 - PLAYER_HEIGHT / 2
      const bottomBound = -viewHeight / 2 + PLAYER_HEIGHT / 2
      playerRef.current!.position.y = Math.max(
        bottomBound,
        Math.min(topBound, playerRef.current!.position.y)
      )
      // --- Update wings and cannons position ---
      leftWing.position.x = playerRef.current!.position.x - PLAYER_WIDTH * 0.4
      leftWing.position.y = playerRef.current!.position.y - PLAYER_HEIGHT * 0.1
      rightWing.position.x = playerRef.current!.position.x + PLAYER_WIDTH * 0.4
      rightWing.position.y = playerRef.current!.position.y - PLAYER_HEIGHT * 0.1
      // Оновлюємо позиції пушок по середині крил
      leftCannon.position.x =
        playerRef.current!.position.x -
        PLAYER_WIDTH * 0.75 +
        -PLAYER_WIDTH * 0.4
      leftCannon.position.y =
        playerRef.current!.position.y -
        PLAYER_HEIGHT * 0.1 -
        PLAYER_HEIGHT * 0.6
      rightCannon.position.x =
        playerRef.current!.position.x + PLAYER_WIDTH * 0.75 + PLAYER_WIDTH * 0.4
      rightCannon.position.y =
        playerRef.current!.position.y -
        PLAYER_HEIGHT * 0.1 -
        PLAYER_HEIGHT * 0.6
      // --- Update flame position and animation (завжди під центром корабля) ---
      flame.position.x = playerRef.current!.position.x
      flame.position.y = playerRef.current!.position.y - PLAYER_HEIGHT * 0.9
      flame.position.z = playerRef.current!.position.z - 0.1
      // Animate flame scale for flicker effect
      const flicker = 1 + 0.15 * Math.sin(performance.now() * 0.018)
      flame.scale.set(1, flicker, 1)
      flame.material.opacity = 0.7 + 0.2 * Math.random()
      // Hide flame if not moving
      if (
        moveRef.current.left ||
        moveRef.current.right ||
        moveRef.current.up ||
        moveRef.current.down
      ) {
        flame.visible = true
      } else {
        flame.visible = false
      }

      // --- Update crack positions and visibility ---
      if (leftCrackRef.current) {
        leftCrackRef.current.position.x = playerRef.current!.position.x
        leftCrackRef.current.position.y = playerRef.current!.position.y
        leftCrackRef.current.visible = lives === 1
      }

      if (rightCrackRef.current) {
        rightCrackRef.current.position.x = playerRef.current!.position.x
        rightCrackRef.current.position.y = playerRef.current!.position.y
        rightCrackRef.current.visible = lives === 1
        // Animate crack flicker
        if (lives === 1) {
          const flicker = 0.7 + 0.3 * Math.sin(performance.now() * 0.01)
          if (
            rightCrackRef.current.material instanceof THREE.MeshBasicMaterial
          ) {
            rightCrackRef.current.material.opacity = flicker
          }
        }
      }

      // Animate left crack flicker
      if (leftCrackRef.current && lives === 1) {
        const flicker = 0.7 + 0.3 * Math.sin(performance.now() * 0.01 + 1)
        if (leftCrackRef.current.material instanceof THREE.MeshBasicMaterial) {
          leftCrackRef.current.material.opacity = flicker
        }
      }
      // --- Update bullets ---
      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].position.y += BULLET_SPEED
        if (bullets[i].position.y > 5 + BULLET_HEIGHT) {
          sceneRef.current!.remove(bullets[i])
          bullets.splice(i, 1)
          continue
        }
        // --- Collision check with enemies ---
        for (let j = enemies.length - 1; j >= 0; j--) {
          const b = bullets[i]
          const e = enemies[j]
          if (
            Math.abs(b.position.x - e.position.x) <
              (BULLET_WIDTH + ENEMY_WIDTH) / 2 &&
            Math.abs(b.position.y - e.position.y) <
              (BULLET_HEIGHT + ENEMY_HEIGHT) / 2
          ) {
            // --- Explosion ---
            const explosionGeometry = new THREE.CircleGeometry(
              ENEMY_WIDTH * 1.1,
              24
            )
            const explosionMaterial = new THREE.MeshBasicMaterial({
              color: 0xffff00,
              transparent: true,
              opacity: 0.7,
            })
            const explosion = new THREE.Mesh(
              explosionGeometry,
              explosionMaterial
            )
            explosion.position.copy(e.position)
            sceneRef.current!.add(explosion)
            explosions.push({ mesh: explosion, timer: 0.35 })
            sceneRef.current!.remove(b)
            sceneRef.current!.remove(e)
            bullets.splice(i, 1)
            enemies.splice(j, 1)
            setScore((s) => s + 1)
            // --- Play explosion sound ---
            if (explosionAudio.current) {
              explosionAudio.current.currentTime = 0
              explosionAudio.current.play()
            }
            break
          }
        }
      }
      // --- Update enemy bullets ---
      for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
        enemyBulletsRef.current[i].position.y -= ENEMY_BULLET_SPEED
        // Remove if out of bounds
        if (enemyBulletsRef.current[i].position.y < -5 - ENEMY_BULLET_HEIGHT) {
          sceneRef.current!.remove(enemyBulletsRef.current[i])
          enemyBulletsRef.current.splice(i, 1)
          continue
        }
        // Check collision with player
        const eb = enemyBulletsRef.current[i]
        const p = playerRef.current!
        if (
          Math.abs(eb.position.x - p.position.x) <
            (ENEMY_BULLET_WIDTH + PLAYER_WIDTH) / 2 &&
          Math.abs(eb.position.y - p.position.y) <
            (ENEMY_BULLET_HEIGHT + PLAYER_HEIGHT) / 2
        ) {
          // Explosion at player position
          const explosionGeometry = new THREE.CircleGeometry(
            PLAYER_WIDTH * 1.5,
            32
          )
          const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.7,
          })
          const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial)
          explosion.position.copy(p.position)
          sceneRef.current!.add(explosion)
          explosions.push({ mesh: explosion, timer: 0.5 })
          sceneRef.current!.remove(eb)
          enemyBulletsRef.current.splice(i, 1)
          setLives((l) => {
            if (l <= 1) setGameOver(true)
            return l - 1
          })
          // Play explosion sound
          if (explosionAudio.current) {
            explosionAudio.current.currentTime = 0
            explosionAudio.current.play()
          }
          continue
        }
      }
      // --- Update enemies ---
      for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].position.y -= ENEMY_SPEED
        // --- Collision check with ship ---
        const e = enemies[i]
        const p = playerRef.current!
        if (
          Math.abs(e.position.x - p.position.x) <
            (ENEMY_WIDTH + PLAYER_WIDTH) / 2 &&
          Math.abs(e.position.y - p.position.y) <
            (ENEMY_HEIGHT + PLAYER_HEIGHT) / 2
        ) {
          // --- Ship explosion ---
          const explosionGeometry = new THREE.CircleGeometry(
            PLAYER_WIDTH * 1.5,
            32
          )
          const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.7,
          })
          const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial)
          explosion.position.copy(p.position)
          sceneRef.current!.add(explosion)
          explosions.push({ mesh: explosion, timer: 0.5 })
          sceneRef.current!.remove(e)
          enemies.splice(i, 1)
          setLives((l) => {
            if (l <= 1) setGameOver(true)
            return l - 1
          })
          // --- Play explosion sound ---
          if (explosionAudio.current) {
            explosionAudio.current.currentTime = 0
            explosionAudio.current.play()
          }
          continue
        }
        // If enemy went out of bounds - just remove
        if (enemies[i].position.y < -5 - ENEMY_HEIGHT) {
          sceneRef.current!.remove(enemies[i])
          enemies.splice(i, 1)
        }
      }
      // --- Update explosions ---
      for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].timer -= 1 / 60
        if (explosions[i].timer <= 0) {
          sceneRef.current!.remove(explosions[i].mesh)
          explosions.splice(i, 1)
        }
      }
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!)
      if (!gameOver) requestAnimationFrame(animate)
    }
    animate()

    // Cleanup
    return () => {
      running = false
      rendererRef.current?.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      clearInterval(enemyInterval)
      clearInterval(enemyShootInterval)
    }
  }, [gameOver, canvasSize])

  useEffect(() => {
    shootAudio.current = new window.Audio('/sounds/shoot.mp3')
    explosionAudio.current = new window.Audio('/sounds/explosion.mp3')
  }, [])

  // --- Small ship-life icons ---
  function LivesIcons() {
    return (
      <div className={styles.livesIcons}>
        {Array.from({ length: lives }).map((_, i) => (
          <svg key={i} width={28} height={28} viewBox='0 0 28 28'>
            <polygon
              points='14,3 25,25 3,25'
              fill='#00fffc'
              stroke='#0ff'
              strokeWidth='2'
            />
          </svg>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* Game area */}
      <div ref={mountRef} className={styles.gameArea}>
        <LivesIcons />
        <div className={styles.score}>Score: {score}</div>
        <div className={styles.lives}>Lives: {lives}</div>
        {gameOver && (
          <div className={styles.gameOver}>
            Game Over!
            <br />
            Score: {score}
            <button
              style={{
                marginTop: 24,
                fontSize: 28,
                padding: '12px 32px',
                borderRadius: 12,
                border: 'none',
                background: '#222',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 2px 8px #0002',
              }}
              onClick={handleRestart}
            >
              Restart
            </button>
          </div>
        )}
      </div>
      {/* Grey statistics panel */}
      <div className={styles.statsPanel}>
        <div className={styles.statsTitle}>Statistics</div>
        <div className={styles.statsRow}>
          Score: <b>{score}</b>
        </div>
        <div className={styles.statsRow}>
          High Score: <b>{highScore}</b>
        </div>
        <div className={styles.statsRow}>
          Lives: <b>{lives}</b>
        </div>
        <div className={styles.controlsTitle}>Controls:</div>
        <ul className={styles.controlsList}>
          <li>← → or A/D — move left/right</li>
          <li>↑ ↓ or W/S — move up/down</li>
          <li>Space — shoot</li>
        </ul>
        <div className={styles.statsFooter}>
          2D Space Shooter
          <br />
          oleh, 2024
        </div>
      </div>
    </div>
  )
}
