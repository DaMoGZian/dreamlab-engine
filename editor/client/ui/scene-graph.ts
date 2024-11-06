import {
  ClientGame,
  Entity,
  EntityChildSpawned,
  EntityDestroyed,
  EntityRenamed,
  EntityReparented,
  Root,
} from "@dreamlab/engine";
import { element as elem, element } from "@dreamlab/ui";
import { EditorMetadataEntity, EditorRootFacadeEntity, Facades } from "../../common/mod.ts";
import { ChevronDown, icon } from "../_icons.ts";
import { UndoRedoManager, type UndoRedoOperation } from "../undo-redo.ts";
import { createEntityMenu } from "../util/entity-types.ts";
import { ContextMenuItem } from "./context-menu.ts";
import { InspectorUI, InspectorUIWidget } from "./inspector.ts";

function eventTargetsEntry(event: Event, entryElement: HTMLElement) {
  if (!(event.target instanceof HTMLElement)) return false;
  return event.target.closest("details[data-entity]") === entryElement;
}

export class SceneGraph implements InspectorUIWidget {
  #section: HTMLElement = elem("section", { id: "scene-graph" }, [
    elem("h1", {}, ["Scene Graph"]),
  ]);

  entryElementMap = new Map<string, HTMLElement>();
  currentDragSource: { entities: Entity[]; entries: HTMLElement[] } | undefined;
  #openEntities: Set<string> = new Set();
  lastSelectedEntry: HTMLElement | null = null; // Keep track of the last selected entry

  constructor(private game: ClientGame) {
    const savedState = localStorage.getItem(`${this.game.worldId}/editor/openEntities`);
    if (savedState) {
      this.#openEntities = new Set(JSON.parse(savedState));
    }
  }

  #saveOpenEntities() {
    localStorage.setItem(
      `${this.game.worldId}/editor/openEntities`,
      JSON.stringify([...this.#openEntities]),
    );
  }

  setup(ui: InspectorUI): void {
    const treeRoot = elem("div", { id: "scene-graph-tree" });
    this.#section.append(treeRoot);

    this.handleEntitySelection(ui, treeRoot);

    if (ui.editMode) {
      this.renderEntry(ui, treeRoot, this.game.world._.EditEntities._.world);
      this.renderEntry(ui, treeRoot, this.game.world._.EditEntities._.local);
      this.renderEntry(ui, treeRoot, this.game.world._.EditEntities._.server);
      this.renderEntry(ui, treeRoot, this.game.world._.EditEntities._.prefabs);
    } else {
      this.renderEntry(ui, treeRoot, this.game.world);
      this.renderEntry(ui, treeRoot, this.game.local);
      this.renderEntry(ui, treeRoot, this.game.prefabs);
    }

    const world = ui.editMode ? this.game.world._.EditEntities._.world : this.game.world;

    this.#section.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();

      ui.contextMenu.drawContextMenu(event.clientX, event.clientY, [
        createEntityMenu("New Entity", type => {
          const newEntity = world.spawn({
            type: Facades.lookupFacadeEntityType(type),
            name: type.name,
            transform: {
              position: this.game.local._.Camera.globalTransform.position,
            },
          });

          UndoRedoManager._.push({
            t: "create-entity",
            parentRef: world.ref,
            def: newEntity.getDefinition(),
          });

          const newEntryElement = this.entryElementMap.get(newEntity.ref);
          if (newEntryElement) this.triggerRename(newEntity, newEntryElement);
        }),
      ]);
    });
  }

  show(uiRoot: HTMLElement): void {
    const left = uiRoot.querySelector("#left-sidebar")!;
    left.prepend(this.#section);
  }

  hide(): void {
    this.#section.remove();
  }

  sortEntries(parent: HTMLElement) {
    const entries = Array.from(parent.querySelectorAll(":scope > details[data-entity]")).map(
      entry => {
        const entity = this.game.entities.lookupByRef(
          (entry as HTMLDetailsElement).dataset.entity!,
        );
        if (entity === undefined) throw new Error("how, dog");
        return [entry, entity] as const;
      },
    );

    const isStringParseableToInt = (s: string | undefined): s is string => {
      if (s === undefined) {
        return false;
      }
      return !isNaN(parseInt(s));
    };

    entries.sort(([_aEntry, a], [_bEntry, b]) => {
      const aSplit = a.name.split(".");
      const bSplit = b.name.split(".");

      if (aSplit.shift() === bSplit.shift()) {
        const ap = aSplit.pop();
        const bp = bSplit.pop();

        if (isStringParseableToInt(ap) && isStringParseableToInt(bp)) {
          // sort by trailing number after dot
          const partA = parseInt(ap);
          const partB = parseInt(bp);
          return partA - partB;
        }
      }

      return a.name.localeCompare(b.name);
    });

    for (const [entry, _] of entries) {
      parent.removeChild(entry);
      parent.append(entry);
    }
  }

  renderEntry(ui: InspectorUI, parent: HTMLElement, entity: Entity) {
    if (entity instanceof EditorMetadataEntity) return;
    if (this.entryElementMap.has(entity.ref)) return;

    const currentEntityRef = entity.ref;

    const toggle = elem("div", { className: "arrow" }, [icon(ChevronDown)]);
    const summary = elem("summary", {}, [
      toggle,
      elem("a", {}, [
        elem("span", { className: "icon" }, [
          (entity.constructor as typeof Entity).icon ?? "🌟",
        ]),
        " ",
        elem("span", { className: "name" }, [entity.name]),
      ]),
    ]);

    const entryElement = elem(
      "details",
      { open: this.#openEntities.has(currentEntityRef) || entity.children.size === 0 },
      [summary],
    );
    entryElement.dataset.entity = entity.ref;
    this.entryElementMap.set(entity.ref, entryElement);

    toggle.addEventListener("click", () => {
      entryElement.open = !entryElement.open;

      if (entryElement.open) {
        this.#openEntities.add(currentEntityRef);
      } else {
        this.#openEntities.delete(currentEntityRef);
      }
      this.#saveOpenEntities();
    });

    summary.addEventListener("click", ev => {
      ev.preventDefault();
    });

    // TODO: maybe some 'click to show more' thing would work well here
    const tooManyEntities = element("div", { className: "too-many-entities" }, [
      `[${entity.children.size} entities not shown]`,
    ]);

    entity.on(EntityChildSpawned, event => {
      const newEntity = event.child;
      if (entity.children.size > 2500) {
        tooManyEntities.textContent = `[${entity.children.size} entities not shown]`;
        entryElement.innerHTML = "";
        entryElement.append(summary);
        entryElement.append(tooManyEntities);
      } else {
        this.renderEntry(ui, entryElement, newEntity);
      }
    });

    entity.on(EntityReparented, () => {
      const parent = entity.parent;
      if (parent === undefined) return;
      const parentElement = this.entryElementMap.get(parent.ref);
      if (parentElement === undefined) return;
      parentElement.append(entryElement);

      this.sortEntries(parentElement);
    });

    entity.on(EntityDestroyed, () => {
      entryElement.remove();
    });

    entity.on(EntityRenamed, () => {
      const name = entryElement.querySelector(":scope > summary .name")!;
      name.textContent = entity.name;
    });

    this.handleEntryDragAndDrop(ui, entity, entryElement);
    this.handleEntryRename(entity, entryElement);
    this.handleEntryContextMenu(ui, entity, entryElement);

    parent.append(entryElement);
    if (entity.children.size > 2500) {
      entryElement.append(tooManyEntities);
    } else {
      for (const child of entity.children.values()) {
        this.renderEntry(ui, entryElement, child);
      }
      this.sortEntries(entryElement);
    }
  }

  handleEntryRename(entity: Entity, entryElement: HTMLElement) {
    if (entity instanceof EditorRootFacadeEntity || entity instanceof Root) return;

    entryElement.addEventListener("dblclick", event => {
      if (!eventTargetsEntry(event, entryElement)) return;
      if (entryElement.querySelector(":scope > summary input")) return;
      this.triggerRename(entity, entryElement);
    });
  }

  triggerRename(entity: Entity, entryElement: HTMLElement) {
    const previousName = entity.name;
    const name = entryElement.querySelector(":scope > summary .name")! as HTMLElement;

    name.style.display = "none";
    const input = elem("input", { type: "text", value: entity.name });
    const reset = () => {
      name.style.display = "inherit";
      input.remove();
    };
    name.parentElement!.append(input);
    input.focus();
    input.setSelectionRange(0, input.value.length);

    input.addEventListener("keypress", event => {
      if (event.key === "Enter") {
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      if (input.value === "" || input.value === entity.name) {
        reset();
        return;
      }

      entity.name = input.value;
      UndoRedoManager._.push({
        t: "rename-entity",
        entityRef: entity.ref,
        previous: previousName,
        name: entity.name,
      });

      reset();
    });
  }

  handleEntryDragAndDrop(ui: InspectorUI, entity: Entity, entryElement: HTMLElement) {
    entryElement.addEventListener("dragover", event => {
      if (!eventTargetsEntry(event, entryElement)) return;

      if (!this.currentDragSource) return;
      const targetEntity = entity;
      const sourceEntities = this.currentDragSource.entities;

      // Prevent dropping onto self or descendants
      if (
        sourceEntities.includes(targetEntity) ||
        sourceEntities.some(se => this.isDescendant(targetEntity, se))
      ) {
        return;
      }
      event.preventDefault();

      entryElement.classList.add("drag-target");
    });

    entryElement.addEventListener("dragleave", () => {
      entryElement.classList.remove("drag-target");
    });

    entryElement.addEventListener("dragend", () => {
      entryElement.classList.remove("drag-target");
    });

    entryElement.addEventListener("drop", event => {
      if (!eventTargetsEntry(event, entryElement)) return;

      if (!this.currentDragSource) return;
      const targetEntity = entity;
      const sourceEntities = this.currentDragSource.entities;

      // Prevent dropping onto self or descendants
      if (
        sourceEntities.includes(targetEntity) ||
        sourceEntities.some(se => this.isDescendant(targetEntity, se))
      ) {
        return;
      }

      // Determine top-level entities (those without a selected parent)
      const topLevelEntities = sourceEntities.filter(
        entity => !sourceEntities.includes(entity.parent!),
      );

      const undoableOperations: (UndoRedoOperation & { t: "compound" })["ops"] = [];

      if (event.getModifierState("Control")) {
        // Clone top-level entities into target
        for (const sourceEntity of topLevelEntities) {
          const newEntity = sourceEntity.cloneInto(targetEntity);
          undoableOperations.push({
            t: "create-entity",
            def: newEntity.getDefinition(),
            parentRef: targetEntity.ref,
          });
        }
      } else {
        // Move top-level entities under target
        for (const sourceEntity of topLevelEntities) {
          const prevParentRef = sourceEntity.parent?.ref;
          sourceEntity.parent = targetEntity;
          if (prevParentRef) {
            undoableOperations.push({
              t: "move-entity",
              entityRef: sourceEntity.ref,
              prevParentRef,
              parentRef: targetEntity.ref,
            });
          }
        }
      }

      if (undoableOperations.length > 0) {
        UndoRedoManager._.push({ t: "compound", ops: undoableOperations });
      }
    });

    if (entity.parent?.id === "game.world._.EditEntities") return;

    entryElement.draggable = true;

    entryElement.addEventListener("dragstart", event => {
      if (!eventTargetsEntry(event, entryElement)) return;

      const selectedEntities = ui.selectedEntity.entities;
      const selectedEntries = selectedEntities
        .map(e => this.entryElementMap.get(e.ref))
        .filter(e => e !== undefined) as HTMLElement[];

      if (selectedEntities.includes(entity)) {
        // Dragging multiple entities
        this.currentDragSource = {
          entities: selectedEntities as Entity[],
          entries: selectedEntries,
        };
        for (const entry of selectedEntries) {
          entry.dataset.dragging = "";
        }
      } else {
        // Dragging single entity
        this.currentDragSource = {
          entities: [entity],
          entries: [entryElement],
        };
        entryElement.dataset.dragging = "";
      }
    });

    entryElement.addEventListener("dragend", () => {
      if (this.currentDragSource) {
        for (const entry of this.currentDragSource.entries) {
          delete entry.dataset.dragging;
        }
      }
      this.currentDragSource = undefined;
    });
  }

  handleEntryContextMenu(ui: InspectorUI, entity: Entity, entryElement: HTMLElement) {
    const summary = entryElement.querySelector(":scope > summary")! as HTMLElement;
    summary.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();

      ui.selectedEntity.entities = [entity];

      const contextMenuItems: ContextMenuItem[] = [
        ["Focus", () => this.game.local._.Camera.pos.assign(entity.pos)],
        createEntityMenu("New Entity", type => {
          const newEntity = entity.spawn({
            type: Facades.lookupFacadeEntityType(type),
            name: type.name,
          });

          UndoRedoManager._.push({
            t: "create-entity",
            parentRef: entity.ref,
            def: newEntity.getDefinition(),
          });

          const newEntryElement = this.entryElementMap.get(newEntity.ref);
          if (newEntryElement) this.triggerRename(newEntity, newEntryElement);
        }),
      ];

      if (!entity.protected)
        contextMenuItems.push([
          "Delete",
          () => {
            const parent = entity.parent;
            if (parent) {
              UndoRedoManager._.push({
                t: "destroy-entity",
                def: entity.getDefinition(),
                parentRef: parent.ref,
              });
            }

            entity.destroy();
          },
        ]);

      ui.contextMenu.drawContextMenu(event.clientX, event.clientY, contextMenuItems);
    });
  }

  handleEntitySelection(ui: InspectorUI, treeRoot: HTMLElement) {
    ui.selectedEntity.listen(() => {
      for (const [entityRef, entry] of this.entryElementMap.entries()) {
        const entity = this.game.entities.lookupByRef(entityRef);
        if (entity && ui.selectedEntity.entities.includes(entity)) {
          entry.classList.add("selected");
        } else {
          entry.classList.remove("selected");
        }
      }
    });

    treeRoot.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;

      // Handle shift-click range selection
      const selectMultiple = event.getModifierState("Control");
      const rangeSelect = event.getModifierState("Shift");

      const entryElement = event.target.closest("details[data-entity] > summary")?.parentNode;
      if (!entryElement) {
        if (!selectMultiple && !rangeSelect) ui.selectedEntity.entities = [];
        return;
      }
      const entity = this.game.entities.lookupByRef(
        (entryElement as HTMLDetailsElement).dataset.entity!,
      );
      if (!entity) return;

      const allEntries = Array.from(
        treeRoot.querySelectorAll("details[data-entity]"),
      ) as HTMLElement[];

      if (rangeSelect && this.lastSelectedEntry) {
        // Perform range selection
        const startIndex = allEntries.indexOf(this.lastSelectedEntry);
        const endIndex = allEntries.indexOf(entryElement as HTMLElement);

        if (startIndex !== -1 && endIndex !== -1) {
          const [from, to] =
            startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          const entriesInRange = allEntries.slice(from, to + 1);
          const entitiesInRange = entriesInRange
            .map(entry => {
              const entityRef = entry.dataset.entity!;
              return this.game.entities.lookupByRef(entityRef);
            })
            .filter(e => e !== undefined) as Entity[];

          ui.selectedEntity.entities = selectMultiple
            ? Array.from(new Set([...ui.selectedEntity.entities, ...entitiesInRange]))
            : entitiesInRange;
        }
        this.lastSelectedEntry = entryElement as HTMLElement;
      } else if (selectMultiple) {
        if (ui.selectedEntity.entities.includes(entity)) {
          ui.selectedEntity.entities = ui.selectedEntity.entities.filter(e => e !== entity);
        } else {
          ui.selectedEntity.entities = [...ui.selectedEntity.entities, entity];
        }
        this.lastSelectedEntry = entryElement as HTMLElement;
      } else {
        ui.selectedEntity.entities = [entity];
        this.lastSelectedEntry = entryElement as HTMLElement;
      }
    });
  }

  // Helper method to check if target is a descendant of source
  private isDescendant(target: Entity, source: Entity): boolean {
    let current = target.parent;
    while (current) {
      if (current === source) return true;
      current = current.parent;
    }
    return false;
  }
}
