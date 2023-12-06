import EventEmitter from 'eventemitter3'
import Matter from 'matter-js'
import { AnimatedSprite, Graphics, Sprite } from 'pixi.js'
import type { Camera } from '~/entities/camera.js'
import { createEntity, dataManager, isEntity } from '~/entity.js'
import type { Entity } from '~/entity.js'
import type { Game } from '~/game'
import type { InputManager } from '~/input/manager.js'
import type { Gear } from '~/managers/gear.js'
import { v, Vec } from '~/math/vector.js'
import type { LooseVector, Vector } from '~/math/vector.js'
import type { NetClient } from '~/network/client.js'
import { onlyNetClient } from '~/network/shared.js'
import type { Physics } from '~/physics.js'
import { bones } from '~/textures/playerAnimations.js'
import type { Bone, PlayerAnimationMap } from '~/textures/playerAnimations.js'
import type { Debug } from '~/utils/debug.js'
import { drawBox } from '~/utils/draw.js'
import { ref } from '~/utils/ref.js'
import type { Ref } from '~/utils/ref.js'

export const PLAYER_MASS = 50
export const PLAYER_SPRITE_SCALE = 0.9
export const PLAYER_ANIMATION_SPEED = 0.4
export const PLAYER_SPRITE_ANCHOR = [0.45, 0.535] as const

interface Data {
  game: Game<false>
  debug: Debug
  inputs: InputManager | undefined
  physics: Physics
  network: NetClient | undefined

  direction: Ref<-1 | 0 | 1>
  facing: Ref<'left' | 'right'>
  colliding: Ref<boolean>
}

interface Render {
  camera: Camera

  sprite: AnimatedSprite
  gfxBounds: Graphics
  gfxFeet: Graphics

  itemSprite: Sprite
}

const symbol = Symbol.for('@dreamlab/core/entities/player')
export const isPlayer = (player: unknown): player is Player => {
  if (!isEntity(player)) return false
  return symbol in player && player[symbol] === true
}

export interface PlayerEvents {
  onToggleNoclip: [enabled: boolean]
  onGearChanged: [item: Gear | undefined]
}

export interface PlayerCommon {
  get position(): Vector
  get size(): PlayerSize
  get body(): Matter.Body
}

export interface Player extends PlayerCommon, Entity<Data, Render> {
  get [symbol](): true
  get bones(): Readonly<Record<Bone, Vector>>
  get events(): EventEmitter<PlayerEvents>
  get gear(): Gear | undefined
  get currentAnimation(): string
  get facingDirection(): number

  setGear(gear: Gear | undefined): void
  teleport(position: LooseVector, resetVelocity?: boolean): void
}

export interface PlayerSize {
  width: number
  height: number
}

const knownPlayerAnimation = ['idle', 'jog', 'jump', 'walk'] as const
const knownAttackAnimation = ['greatsword', 'punch'] as const
const knownRangedAttackAnimation = ['bow', 'shoot'] as const

export type KnownPlayerAnimation = (typeof knownPlayerAnimation)[number]
export type KnownAttackAnimation = (typeof knownAttackAnimation)[number]
export type KnownRangedAttackAnimation =
  (typeof knownRangedAttackAnimation)[number]

export type KnownAnimation = (typeof knownAnimation)[number]
const knownAnimation = [
  ...knownPlayerAnimation,
  ...knownAttackAnimation,
  ...knownRangedAttackAnimation,
] as const

export const isKnownAnimation = (
  animation: string,
): animation is KnownAnimation => {
  // @ts-expect-error union narrowing
  return knownAnimation.includes(animation)
}

export enum PlayerInput {
  Attack = '@player/attack',
  Crouch = '@player/crouch',
  Drag = '@editor/drag',
  Jog = '@player/jog',
  Jump = '@player/jump',
  ToggleNoclip = '@player/toggle-noclip',
  WalkLeft = '@player/walk-left',
  WalkRight = '@player/walk-right',
}

export const createPlayer = (
  animations: PlayerAnimationMap<KnownAnimation>,
  { width = 80, height = 370 }: Partial<PlayerSize> = {},
) => {
  const events = new EventEmitter<PlayerEvents>()

  const maxSpeed = 1
  const jumpForce = 5
  const feetSensor = 4

  let hasJumped = false
  let isJogging = false

  let noclip = false
  const noclipSpeed = 15
  let isDragging = false
  let initialClickOnEntity = false
  let previousCursorPosition: Matter.Vector | null | undefined = null
  let attack = false

  const onToggleNoclip = (pressed: boolean) => {
    // TODO(Charlotte): if a player is noclipping, we should network this
    // so that the serverside prediction can take that into account
    if (pressed) {
      noclip = !noclip
      events.emit('onToggleNoclip', noclip)
    }
  }

  let currentAnimation: KnownAnimation = 'idle'
  let gear: Gear | undefined
  let spriteSign = 1
  let currentFrame = 0

  const body = Matter.Bodies.rectangle(0, 0, width, height, {
    label: 'player',
    render: { visible: false },

    inertia: Number.POSITIVE_INFINITY,
    inverseInertia: 0,
    mass: PLAYER_MASS,
    inverseMass: 1 / PLAYER_MASS,
    friction: 0,
  })

  const getAnimation = (direction: number): KnownAnimation => {
    if (noclip) return 'idle'
    if (hasJumped && !attack) return 'jump'

    const animationName = gear ? gear.animationName.toLowerCase() : 'punch'
    if (
      attack &&
      ['greatsword', 'bow', 'punch', 'shoot'].includes(animationName)
    )
      return animationName as KnownAnimation
    if (direction !== 0) return isJogging ? 'jog' : 'walk'

    return 'idle'
  }

  const isAttackFrame = () => {
    switch (currentAnimation) {
      case 'greatsword':
        return currentFrame >= 24
      case 'punch':
        return currentFrame >= 5
      case 'bow':
        return currentFrame === 9
      case 'shoot':
        return currentFrame === 0
      default:
        return false
    }
  }

  const bonePosition = (bone: Bone): Vector => {
    const animation = animations[currentAnimation]

    const animW = animation.width
    const animH = animation.height
    const position = animation.boneData.bones[bone][currentFrame]!

    if (position === undefined) {
      console.error(
        `Missing bone data for this frame!!\nCurrent animation: ${currentAnimation} at ${currentFrame}`,
      )
    }

    const flip = spriteSign
    const normalized = {
      x: flip === 1 ? position.x : animW - position.x,
      y: position.y,
    }

    const offsetFromCenter: Vector = {
      x: (1 - (normalized.x / animW) * 2) * (animW / -2),
      y: (1 - (normalized.y / animH) * 2) * (animH / -2),
    }

    const offsetFromAnchor = Vec.add(offsetFromCenter, {
      x: flip * ((1 - PLAYER_SPRITE_ANCHOR[0] * 2) * (animW / 2)),
      y: (1 - PLAYER_SPRITE_ANCHOR[1] * 2) * (animH / 2),
    })

    const scaled = Vec.mult(offsetFromAnchor, PLAYER_SPRITE_SCALE)
    return Vec.add(body.position, scaled)
  }

  const boneMap = {} as Readonly<Record<Bone, Vector>>
  for (const bone of bones) {
    Object.defineProperty(boneMap, bone, {
      get: () => bonePosition(bone),
    })
  }

  Object.freeze(boneMap)

  const player: Player = createEntity({
    get [symbol]() {
      return true as const
    },

    get position(): Vector {
      return Vec.clone(body.position)
    },

    get size() {
      return { width, height }
    },

    get body() {
      return body
    },

    get bones(): Readonly<Record<Bone, Vector>> {
      return boneMap
    },

    get events(): EventEmitter<PlayerEvents> {
      return events
    },

    get gear(): Gear | undefined {
      return gear
    },

    get currentAnimation(): string {
      return currentAnimation
    },

    get facingDirection(): number {
      return -spriteSign
    },

    setGear(newGear: Gear | undefined) {
      gear = newGear
      events.emit('onGearChanged', gear)

      const { game } = dataManager.getData(this)
      void game.client.network?.sendPlayerGear(gear)
    },

    teleport(position: LooseVector, resetVelocity = true) {
      Matter.Body.setPosition(body, v(position))
      if (resetVelocity) Matter.Body.setVelocity(body, { x: 0, y: 0 })
    },

    init({ game, physics }) {
      const debug = game.debug
      const inputs = game.client?.inputs
      const network = onlyNetClient(game)

      // TODO: Reimplement spawnpoints
      physics.registerPlayer(this as Player)

      // Matter.Composite.add(physics.world, itemBody)
      if (inputs) {
        inputs.registerInput(PlayerInput.WalkLeft, 'Walk Left', 'KeyA')
        inputs.registerInput(PlayerInput.WalkRight, 'Walk Right', 'KeyD')
        inputs.registerInput(PlayerInput.Jump, 'Jump', 'Space')
        inputs.registerInput(PlayerInput.Crouch, 'Crouch', 'KeyS')
        inputs.registerInput(PlayerInput.Jog, 'Jog', 'ShiftLeft')
        inputs.registerInput(PlayerInput.Attack, 'Attack', 'MouseLeft')
        inputs.registerInput(PlayerInput.ToggleNoclip, 'Toggle Noclip', 'KeyV')
        inputs.registerInput(PlayerInput.Drag, 'Editor Drag', 'MouseLeft')
        inputs.addListener(PlayerInput.ToggleNoclip, onToggleNoclip)
      }

      return {
        game,
        debug,
        inputs,
        physics,
        network,
        direction: ref(0),
        facing: ref('left'),
        colliding: ref(false),
        itemColliding: ref(false),
      }
    },

    initRenderContext(_, { stage, camera }) {
      const sprite = new AnimatedSprite(animations[currentAnimation].textures)
      sprite.animationSpeed = PLAYER_ANIMATION_SPEED
      sprite.scale.set(PLAYER_SPRITE_SCALE)
      sprite.anchor.set(...PLAYER_SPRITE_ANCHOR)
      sprite.play()

      const item = gear
      const itemSprite = item ? new Sprite(item.texture) : new Sprite()
      itemSprite.width = 200
      itemSprite.height = 200

      const gfxBounds = new Graphics()
      const gfxFeet = new Graphics()

      sprite.zIndex = 10
      gfxBounds.zIndex = sprite.zIndex + 1
      gfxFeet.zIndex = sprite.zIndex + 2

      drawBox(gfxBounds, { width, height }, { stroke: '#00f' })

      stage.addChild(sprite, gfxBounds, gfxFeet)
      stage.addChild(itemSprite)

      return {
        camera,
        sprite,
        gfxBounds,
        gfxFeet,
        itemSprite,
        item,
      }
    },

    teardown({ inputs, physics }) {
      events.removeAllListeners()

      inputs?.removeListener(PlayerInput.ToggleNoclip, onToggleNoclip)
      physics.clearPlayer()
    },

    teardownRenderContext({ sprite, itemSprite, gfxBounds, gfxFeet }) {
      sprite.destroy()
      itemSprite.destroy()
      gfxBounds.destroy()
      gfxFeet.destroy()
    },

    onPhysicsStep(
      { delta },
      { game, inputs, physics, network, direction, facing, colliding },
    ) {
      const left = inputs?.getInput(PlayerInput.WalkLeft) ?? false
      const right = inputs?.getInput(PlayerInput.WalkRight) ?? false
      const jump = inputs?.getInput(PlayerInput.Jump) ?? false
      attack = (colliding && inputs?.getInput(PlayerInput.Attack)) ?? false
      isJogging = inputs?.getInput(PlayerInput.Jog) ?? false
      const crouch = inputs?.getInput(PlayerInput.Crouch) ?? false
      const drag = inputs?.getInput(PlayerInput.Drag) ?? false

      direction.value = left ? -1 : right ? 1 : 0
      const xor = left ? !right : right

      if (direction.value !== 0) {
        const _facing = direction.value === -1 ? 'left' : 'right'
        facing.value = _facing
      }

      // TODO(Charlotte): factor out movement code into its own place,
      // so that we can apply it to NetPlayers for prediction (based on inputs)
      // on both the client and server
      body.isStatic = noclip
      body.isSensor = noclip
      if (noclip) {
        let newPosition
        const cursorPosition = inputs?.getCursor()

        if (drag && cursorPosition) {
          const query = game.queryPosition(cursorPosition)
          const queryResults = query.map(({ definition: { tags } }) => tags)

          const isCursorOverNonLockedEntity = queryResults.some(
            tags => !tags?.includes('editorLocked'),
          )

          if (!isDragging && !initialClickOnEntity) {
            initialClickOnEntity = isCursorOverNonLockedEntity
            isDragging = true
            previousCursorPosition = cursorPosition
          } else if (
            isDragging &&
            !initialClickOnEntity &&
            previousCursorPosition
          ) {
            const cursorDelta = Vec.sub(previousCursorPosition, cursorPosition)
            const amplifiedMovement = Vec.mult(cursorDelta, 2)
            newPosition = Vec.add(body.position, amplifiedMovement)
            Matter.Body.setPosition(body, newPosition)
            previousCursorPosition = cursorPosition
          }
        } else {
          isDragging = false
          previousCursorPosition = null
          initialClickOnEntity = false

          const movement = Vec.create()
          if (left) movement.x -= 1
          if (right) movement.x += 1
          if (jump) movement.y -= 1
          if (crouch) movement.y += 1

          const speed = isJogging ? noclipSpeed * 2.5 : noclipSpeed
          newPosition = Vec.add(
            body.position,
            Vec.mult(movement, speed * delta * 50),
          )

          // @ts-expect-error Incorrect typings
          Matter.Body.setPosition(body, newPosition, true)
        }
      } else {
        if (xor) {
          const targetVelocity = maxSpeed * direction.value
          if (targetVelocity !== 0) {
            const velocityVector = targetVelocity / body.velocity.x
            const forcePercent = Math.min(Math.abs(velocityVector) / 2, 1)
            const newForce =
              (isJogging ? 2 : 0.5) * forcePercent * direction.value

            Matter.Body.applyForce(body, body.position, Vec.create(newForce, 0))
          }
        }

        if (Math.sign(body.velocity.x) !== direction.value) {
          Matter.Body.applyForce(
            body,
            body.position,
            Vec.create(-body.velocity.x / 20, 0),
          )
        }

        const minVelocity = 0.000_01
        if (Math.abs(body.velocity.x) <= minVelocity) {
          Matter.Body.setVelocity(body, Vec.create(0, body.velocity.y))
        }

        const feet = Matter.Bodies.rectangle(
          body.position.x,
          body.position.y + height / 2 - feetSensor / 2,
          width - feetSensor,
          feetSensor,
        )

        const bodies = physics.world.bodies
          .filter(other => other !== body)
          .filter(other => !other.isSensor)
          .filter(other =>
            Matter.Detector.canCollide(
              body.collisionFilter,
              other.collisionFilter,
            ),
          )

        const query = Matter.Query.region(bodies, feet.bounds)
        const isColliding = query.length > 0
        colliding.value = isColliding

        if (isColliding && jump && !hasJumped) {
          hasJumped = true
          Matter.Body.applyForce(
            body,
            body.position,
            Vec.create(0, -1 * jumpForce),
          )
        }

        if (!jump && isColliding) hasJumped = false
      }

      if (attack && isAttackFrame()) {
        game.events.common.emit('onPlayerAttack', this as Player, gear)
      }

      void network?.sendPlayerPosition(
        body.position,
        body.velocity,
        facing.value !== 'left',
      )

      void network?.sendPlayerMotionInputs({
        jump,
        crouch,
        walkLeft: left,
        walkRight: right,
        toggleNoclip: false,
        attack,
        jog: false,
      })
    },

    onRenderFrame(
      { smooth },
      {
        game,
        debug,
        network,
        inputs,
        direction: { value: direction },
        facing: { value: facing },
        colliding: { value: colliding },
      },
      { camera, sprite, itemSprite, gfxBounds, gfxFeet },
    ) {
      if (noclip) {
        const cursorPosition = inputs?.getCursor()
        let cursorStyle = 'default'

        if (cursorPosition) {
          const query = game.queryPosition(cursorPosition)
          const queryResults = query.map(({ definition: { tags } }) => tags)
          const isCursorOverNonLockedEntity = queryResults.some(
            tags => !tags?.includes('editorLocked'),
          )

          if (isDragging && !initialClickOnEntity) {
            cursorStyle = 'grabbing'
          } else if (!isDragging && isCursorOverNonLockedEntity) {
            cursorStyle = 'pointer'
          } else if (!isDragging) {
            cursorStyle = 'grab'
          }
        }

        game.client.render.container.style.cursor = cursorStyle
      } else {
        game.client.render.container.style.cursor = 'default'
      }

      sprite.visible = !noclip
      gfxBounds.visible = !noclip
      gfxFeet.visible = !noclip

      const scale = facing === 'left' ? 1 : -1
      const newScale = scale * PLAYER_SPRITE_SCALE
      if (sprite.scale.x !== newScale) {
        sprite.scale.x = newScale
        spriteSign = Math.sign(sprite.scale.x)
      }

      const newAnimation = getAnimation(direction)
      if (newAnimation !== currentAnimation) {
        currentAnimation = newAnimation
        sprite.textures = animations[newAnimation].textures
        const getSpeedMultiplier = (animation_name: string) => {
          if (gear?.speedMultiplier) {
            return gear.speedMultiplier
          }

          switch (animation_name) {
            case 'greatsword':
              return 2.2
            case 'punch':
              return 2
            default:
              return 1
          }
        }

        sprite.animationSpeed =
          PLAYER_ANIMATION_SPEED * getSpeedMultiplier(currentAnimation)
        sprite.loop = newAnimation !== 'jump'

        sprite.gotoAndPlay(0)
        void network?.sendPlayerAnimation(newAnimation)
      }

      currentFrame = sprite.currentFrame
      const smoothed = Vec.add(body.position, Vec.mult(body.velocity, smooth))
      const pos = Vec.add(smoothed, camera.offset)

      sprite.position = pos
      gfxBounds.position = pos
      gfxBounds.alpha = debug.value ? 0.5 : 0

      const inactive = '#f00'
      const active = '#0f0'

      gfxFeet.alpha = debug.value ? 0.5 : 0
      gfxFeet.position = Vec.add(
        pos,
        Vec.create(0, height / 2 - feetSensor / 2),
      )

      drawBox(
        gfxFeet,
        { width: width - feetSensor, height: feetSensor },
        { strokeAlpha: 0, fill: colliding ? active : inactive, fillAlpha: 1 },
      )

      if (gear && !noclip) {
        itemSprite.visible = Boolean(attack)

        const currentItem = gear
        if (itemSprite.texture !== currentItem.texture) {
          itemSprite.texture = currentItem.texture
        }

        const handMapping: Record<string, 'handLeft' | 'handRight'> = {
          handLeft: 'handLeft',
          handRight: 'handRight',
        }

        const currentHandKey = currentItem.bone ?? 'handLeft'
        const mappedHand = handMapping[currentHandKey]

        const pos = Vec.add(
          {
            x: boneMap[mappedHand as 'handLeft' | 'handRight'].x,
            y: boneMap[mappedHand as 'handLeft' | 'handRight'].y,
          },
          camera.offset,
        )

        itemSprite.position = pos

        const animation = animations[currentAnimation]
        const handOffsets =
          animation.boneData.handOffsets[
            mappedHand as 'handLeft' | 'handRight'
          ][currentFrame]

        let handRotation = Math.atan2(
          handOffsets!.y.y - handOffsets!.x.y,
          handOffsets!.y.x - handOffsets!.x.x,
        )
        let itemRotation = -currentItem.rotation * (Math.PI / 180)

        itemRotation *= scale === -1 ? -1 : 1
        handRotation *= scale === -1 ? -1 : 1
        itemSprite.rotation = handRotation + itemRotation

        const initialDimensions = {
          width: itemSprite.width,
          height: itemSprite.height,
        }
        itemSprite.scale.x = -scale
        Object.assign(itemSprite, initialDimensions)

        itemSprite.anchor.set(currentItem.anchor.x, currentItem.anchor.y)
      } else {
        itemSprite.visible = false
      }
    },
  })

  return player
}
