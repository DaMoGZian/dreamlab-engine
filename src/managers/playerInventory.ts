import type { Texture } from 'pixi.js'
import { createSprite } from '~/textures/sprites.js'
import type { ObjectItem } from './playerDataManager'

export interface ItemOptions {
  anchorX?: number | undefined
  anchorY?: number | undefined
  hand?: string // right or left
}

export interface Item {
  id: string
  displayName: string
  image: Texture
  animationName: string
  itemOptions?: ItemOptions
}

export class PlayerInventory {
  private currentObjectIndex: number
  private items: Item[]

  public constructor() {
    this.currentObjectIndex = 0
    this.items = []
  }

  public setObjects(objects: ObjectItem[]): void {
    this.items = objects.map(obj => {
      const imageUrl =
        obj.imageTasks && obj.imageTasks.length > 0
          ? obj.imageTasks[0]!.imageURL
          : ''

      const itemTexture = createSprite(imageUrl).texture

      const itemOptions: ItemOptions = {}
      if (obj.handlePoint) {
        itemOptions.anchorX = obj.handlePoint.x
        itemOptions.anchorY = obj.handlePoint.y
      }
      // if(obj.hand) {
      //   itemOptions.hand = obj.hand;
      // }

      return {
        id: obj.id,
        displayName: obj.displayName,
        image: itemTexture,
        animationName: obj.animationName,
        itemOptions,
      }
    })
  }

  public nextItem(): Item {
    this.currentObjectIndex = (this.currentObjectIndex + 1) % this.items.length
    return this.items[this.currentObjectIndex] ?? this.dummyItem()
  }

  public currentItem(): Item {
    return this.items[this.currentObjectIndex] ?? this.dummyItem()
  }

  public getItems(): Item[] {
    return this.items
  }

  public addItem(item: Item): void {
    this.items.push(item)
  }

  public removeItem(targetItem: Item): void {
    const index = this.items.findIndex(item => item.id === targetItem.id)
    if (index !== -1) {
      this.items.splice(index, 1)
    }
  }

  public setCurrentItem(targetItem: Item): void {
    const index = this.items.findIndex(item => item.id === targetItem.id)
    if (index < 0 || index >= this.items.length) {
      console.error('Invalid item index.')
      return
    }

    this.currentObjectIndex = index
  }

  public setItemIndex(index: number): void {
    if (index < 0 || index >= this.items.length) {
      console.error('Invalid item index.')
      return
    }

    this.currentObjectIndex = index
  }

  public clear(): void {
    this.items = []
    this.currentObjectIndex = 0
  }

  public dummyItem(): Item {
    return {
      id: 'default',
      displayName: 'Default Item',
      image: createSprite(
        'https://dreamlab-user-assets.s3.us-east-1.amazonaws.com/path-in-s3/1693261056400.png',
      ).texture,
      animationName: 'greatsword',
      itemOptions: {
        anchorX: undefined,
        anchorY: undefined,
        hand: 'right',
      },
    }
  }
}
