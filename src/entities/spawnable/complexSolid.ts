import Matter from 'matter-js'
import type { Body } from 'matter-js'
import { Graphics } from 'pixi.js'
import { z } from 'zod'
import type { Camera } from '~/entities/camera.js'
import { dataManager } from '~/entity.js'
import { cloneTransform } from '~/math/transform.js'
import { Vec, VectorSchema } from '~/math/vector.js'
import type { Vector } from '~/math/vector.js'
import type { Physics } from '~/physics.js'
import { createSpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type { SpawnableEntity } from '~/spawnable/spawnableEntity.js'
import type { Debug } from '~/utils/debug.js'
import { drawComplexPolygon } from '~/utils/draw.js'
import { decodePolygons } from '~/utils/polygons.js'

const ArgsSchema = z.object({
  polygon: VectorSchema.array().array().or(z.string()),
})

interface Data {
  debug: Debug
  physics: Physics

  polygons: Vector[][]
  bodies: Body[]
}

interface Render {
  camera: Camera
  gfx: Graphics
}

export const createComplexSolid = createSpawnableEntity<
  typeof ArgsSchema,
  SpawnableEntity<Data, Render>,
  Data,
  Render
>(ArgsSchema, ({ transform, zIndex, tags, preview }, { polygon: poly }) => ({
  get transform() {
    return cloneTransform(transform)
  },

  get tags() {
    return tags
  },

  bounds() {
    // TODO: Get bounding box of complex solid
    return undefined
  },

  init({ game, physics }) {
    const debug = game.debug

    const polygons = typeof poly === 'string' ? decodePolygons(poly) : poly
    const bodies = polygons.map(points => {
      const { x, y } = Vec.add(
        transform.position,
        Matter.Vertices.centre(points),
      )

      return Matter.Bodies.fromVertices(x, y, [points], {
        label: 'complexSolid',
        render: { visible: false },

        isStatic: true,
        isSensor: preview,
        friction: 0,
      })
    })

    physics.register(this, ...bodies)
    return { debug, physics, polygons, bodies }
  },

  initRenderContext(_, { stage, camera }) {
    const { polygons } = dataManager.getData(this)

    const gfx = new Graphics()
    gfx.zIndex = zIndex + 1

    drawComplexPolygon(gfx, polygons)
    stage.addChild(gfx)

    return { camera, gfx }
  },

  teardown({ physics, bodies }) {
    physics.unregister(this, ...bodies)
  },

  teardownRenderContext({ gfx }) {
    gfx.destroy()
  },

  onRenderFrame(_, { debug }, { camera, gfx }) {
    const pos = Vec.add(transform.position, camera.offset)

    gfx.position = pos
    gfx.alpha = debug.value ? 0.5 : 0
  },
}))
