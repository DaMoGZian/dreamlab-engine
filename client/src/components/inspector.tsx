import {
  Behavior,
  EntityDescendantRenamed,
  EntityRenamed,
  EntityTransformUpdate,
  Value,
} from "@dreamlab/engine";
import { useAtom } from "jotai";
import { Asterisk, CirclePlus, PieChart, Rotate3D, Route, ShieldQuestion } from "lucide-react";
// @deno-types="npm:@types/react@18.3.1"
import { memo, useCallback, useEffect, useState } from "react";
import { selectedEntityAtom } from "../context/editor-context.tsx";
import { useModal } from "../context/modal-context.tsx";
import { currentGame } from "../global-game.ts";
import { useFiles } from "../hooks/useFiles.ts";
import { AxisInputField } from "./ui/axis-input.tsx";
import { InputField } from "./ui/input.tsx";
import { Category } from "./ui/panel.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

const Inspector = () => {
  const [selectedEntity, setSelectedEntity] = useAtom(selectedEntityAtom);

  const [name, setName] = useState<string>("");
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [globalPosition, setGlobalPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [rotation, setRotation] = useState<number>(0);
  const [globalRotation, setGlobalRotation] = useState<number>(0);
  const [scale, setScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [values, setValues] = useState<Partial<Record<string, Value<unknown>>>>({});
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [behaviorValues, setBehaviorValues] = useState<
    Partial<Record<string, Partial<Record<string, Value<unknown>>>>>
  >({});
  const { openModal, closeModal } = useModal();

  const { data, isLoading, isError } = useFiles(currentGame.instanceId);

  useEffect(() => {
    if (!selectedEntity) return;

    const entity = selectedEntity;
    const updateValues = () => {
      setName(entity.name);
      setPosition({
        x: Math.round(entity.transform.position.x * 10) / 10,
        y: Math.round(entity.transform.position.y * 10) / 10,
      });
      setGlobalPosition({
        x: Math.round(entity.globalTransform.position.x * 10) / 10,
        y: Math.round(entity.globalTransform.position.y * 10) / 10,
      });
      setRotation(Math.round(entity.transform.rotation * (180 / Math.PI) * 10) / 10);
      setGlobalRotation(
        Math.round(entity.globalTransform.rotation * (180 / Math.PI) * 10) / 10,
      );
      setScale({
        x: Math.round(entity.transform.scale.x * 10) / 10,
        y: Math.round(entity.transform.scale.y * 10) / 10,
      });
      setValues(Object.fromEntries(entity.values.entries()));
      setBehaviors(entity.behaviors.map(behavior => behavior.constructor.name));
      const behaviorVals: Partial<Record<string, Partial<Record<string, Value<unknown>>>>> = {};
      entity.behaviors.forEach(behavior => {
        behaviorVals[behavior.constructor.name] = Object.fromEntries(behavior.values.entries());
      });
      setBehaviorValues(behaviorVals);
    };
    updateValues();
    entity.on(EntityTransformUpdate, updateValues);
    entity.on(EntityRenamed, updateValues);
    entity.on(EntityDescendantRenamed, updateValues);
    return () => {
      entity.unregister(EntityTransformUpdate, updateValues);
      entity.unregister(EntityRenamed, updateValues);
      entity.unregister(EntityDescendantRenamed, updateValues);
    };
  }, [selectedEntity]);

  const handleNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (selectedEntity) {
        selectedEntity.name = newName;
        setSelectedEntity(selectedEntity);
      }
    },
    [selectedEntity, setName, setSelectedEntity],
  );

  const handlePositionChange = useCallback(
    (axis: "x" | "y", value: number) => {
      const newPosition = { x: position.x, y: position.y, [axis]: Math.round(value * 10) / 10 };
      setPosition(newPosition);
      if (selectedEntity) {
        selectedEntity.transform.position = newPosition;
        setSelectedEntity(selectedEntity);
      }
    },
    [selectedEntity, position, setPosition, setSelectedEntity],
  );

  const handlePositionChangeX = useCallback(
    (value: number) => handlePositionChange("x", value),
    [handlePositionChange],
  );
  const handlePositionChangeY = useCallback(
    (value: number) => handlePositionChange("y", value),
    [handlePositionChange],
  );

  const handleRotationChange = useCallback(
    (newRotation: number) => {
      const roundedRotation = Math.round(newRotation * 10) / 10;
      setRotation(roundedRotation);
      if (selectedEntity) {
        const rotationInRadians = roundedRotation * (Math.PI / 180);
        selectedEntity.transform.rotation = rotationInRadians;
        setSelectedEntity(selectedEntity);
      }
    },
    [selectedEntity, setRotation, setSelectedEntity],
  );

  const handleScaleChange = useCallback(
    (axis: "x" | "y", value: number) => {
      const newScale = { x: scale.x, y: scale.y, [axis]: Math.round(value * 10) / 10 };
      setScale(newScale);
      if (selectedEntity) {
        selectedEntity.transform.scale = newScale;
        setSelectedEntity(selectedEntity);
      }
    },
    [selectedEntity, scale, setScale, setSelectedEntity],
  );

  const handleScaleChangeX = useCallback(
    (value: number) => handleScaleChange("x", value),
    [handleScaleChange],
  );
  const handleScaleChangeY = useCallback(
    (value: number) => handleScaleChange("y", value),
    [handleScaleChange],
  );

  const handleValueChange = (key: string) => (newValue: string) => {
    setValues(prevValues => {
      const newValues = { ...prevValues };
      if (newValues[key]) {
        newValues[key]!.value = newValue;
      }
      if (selectedEntity) {
        selectedEntity.set({ [key]: newValue });
        setSelectedEntity(selectedEntity);
      }
      return newValues;
    });
  };

  const updateBehaviorValues = (behavior: Behavior, key: string, newValue: unknown) => {
    const Value = behavior.values.get(key) as Value<unknown>;
    if (!Value) {
      throw new Error(`Property name '${key}' does not exist on Behavior!`);
    }
    Value.value = newValue;
  };

  const handleBehaviorValueChange =
    (behaviorName: string, key: string) => (newValue: string) => {
      setBehaviorValues(prevValues => {
        const newValues = { ...prevValues };
        if (newValues[behaviorName] && newValues[behaviorName]![key]) {
          newValues[behaviorName]![key]!.value = newValue;
        }
        if (selectedEntity) {
          const behavior = selectedEntity.behaviors.find(
            b => b.constructor.name === behaviorName,
          );
          if (behavior) {
            updateBehaviorValues(behavior, key, newValue);
            setSelectedEntity(selectedEntity);
          }
        }
        return newValues;
      });
    };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    let filePath = event.dataTransfer.getData("text/plain");
    if (filePath && selectedEntity) {
      if (filePath.endsWith(".ts")) {
        filePath = filePath.replace(".ts", ".js");
      } else if (filePath.endsWith(".tsx")) {
        filePath = filePath.replace(".tsx", ".jsx");
      }

      try {
        const scriptUrl = `http://127.0.0.1:8000/api/v1/edit/${currentGame.instanceId}/files/${filePath}`;
        try {
          const module = await import(scriptUrl);
          const behavior = module.default;
          selectedEntity.addBehavior({ type: behavior });
          setSelectedEntity(selectedEntity);
          setBehaviors(selectedEntity.behaviors.map(b => b.constructor.name));

          const behaviorVals: Partial<Record<string, Partial<Record<string, Value<unknown>>>>> =
            {};
          selectedEntity.behaviors.forEach(behavior => {
            behaviorVals[behavior.constructor.name] = Object.fromEntries(
              behavior.values.entries(),
            );
          });
          setBehaviorValues(behaviorVals);
        } catch (importError) {
          console.error("Failed to import module from script content:", importError);
        }
      } catch (fetchError) {
        console.error("Failed to fetch or import script content:", fetchError);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleBehaviorSubmit = async (scriptPath: string) => {
    await addBehavior(scriptPath);
    closeModal();
  };

  const showAddBehaviorModal = () => {
    openModal(
      <div>
        <div className="flex items-center">
          <h2 className="text-lg font-medium text-textPrimary">Add Behavior</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ml-2 cursor-help">
                <Asterisk className="w-4 h-4 text-textPrimary" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                Tip: Drag and drop a file into the inspector window to seamlessly add a behavior
                to your entity.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-2 text-xs text-textSecondary">Select a behavior from a file to add:</p>
        <select
          onChange={e => handleBehaviorSubmit(e.target.value)}
          className="w-full border rounded mt-2"
        >
          <option value="">Select a file...</option>
          {!isLoading && !isError ? (
            data?.files.map((file, index) => (
              <option key={index} value={file} title={file}>
                {file.length > 60 ? `${file.substring(0, 57)}...` : file}
              </option>
            ))
          ) : (
            <option disabled>Loading behaviors...</option>
          )}
        </select>
      </div>,
    );
  };

  const addBehavior = async (scriptPath: string) => {
    try {
      if (scriptPath.endsWith(".ts")) {
        scriptPath = scriptPath.replace(".ts", ".js");
      } else if (scriptPath.endsWith(".tsx")) {
        scriptPath = scriptPath.replace(".tsx", ".jsx");
      }
      const scriptUrl = `http://127.0.0.1:8000/api/v1/edit/${currentGame.instanceId}/files/${scriptPath}`;
      try {
        const module = await import(scriptUrl);
        const behavior = module.default;
        if (selectedEntity) {
          selectedEntity.addBehavior({ type: behavior });
          setSelectedEntity(selectedEntity);
          setBehaviors(selectedEntity.behaviors.map(b => b.constructor.name));

          const behaviorVals: Partial<Record<string, Partial<Record<string, Value<unknown>>>>> =
            {};
          selectedEntity.behaviors.forEach(behavior => {
            behaviorVals[behavior.constructor.name] = Object.fromEntries(
              behavior.values.entries(),
            );
          });
          setBehaviorValues(behaviorVals);
        }
      } catch (importError) {
        console.error("Failed to import module from script content:", importError);
      }
    } catch (fetchError) {
      console.error("Failed to fetch or import script content:", fetchError);
    }
  };

  if (!selectedEntity) {
    return (
      <div className="h-full" title="Inspector">
        <div className="p-4">
          <p className="text-textSecondary">No entity selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full" title="Inspector" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="p-2">
        <InputField type="text" label="Name" value={name} onChange={handleNameChange} />
      </div>
      <Category
        title="Transform"
        titleIcon={<Rotate3D className="text-green w-4 h-4" />}
        icons={[
          {
            id: "help",
            element: <ShieldQuestion className="w-4 h-4" />,
            onClick: () => window.open("https://docs.dreamlab.gg/", "_blank"),
            tooltip: "View Transform Docs",
          },
        ]}
      >
        <div className="mb-2">
          <label className="block text-sm font-medium text-textPrimary">Position</label>
          <div className="flex space-x-2">
            <AxisInputField axis="x" value={position.x} onChange={handlePositionChangeX} />
            <AxisInputField axis="y" value={position.y} onChange={handlePositionChangeY} />
          </div>
        </div>
        <div className="text-textSecondary text-xs mb-4">
          Global pos: {globalPosition.x}, {globalPosition.y}
        </div>

        <InputField
          label="Rotation"
          type="number"
          value={rotation}
          onChange={handleRotationChange}
        />
        <div className="text-textSecondary text-xs mb-4">Global rotation: {globalRotation}</div>

        <div>
          <label className="block text-sm font-medium text-textPrimary">Scale</label>
          <div className="flex space-x-2">
            <AxisInputField axis="x" value={scale.x} onChange={handleScaleChangeX} />
            <AxisInputField axis="y" value={scale.y} onChange={handleScaleChangeY} />
          </div>
        </div>
      </Category>
      <Category
        title="Values"
        titleIcon={<PieChart className="text-primaryLight w-4 h-4" />}
        icons={[
          {
            id: "help",
            element: <ShieldQuestion className="w-4 h-4" />,
            onClick: () => window.open("https://docs.dreamlab.gg/", "_blank"),
            tooltip: "View Values Docs",
          },
        ]}
      >
        {Object.keys(values).map(key => (
          <InputField
            type="text"
            key={key}
            label={key}
            value={String(values[key]?.value)}
            onChange={handleValueChange(key)}
          />
        ))}
      </Category>
      <Category
        title="Behaviors"
        titleIcon={<Route className="text-yellow w-4 h-4" />}
        icons={[
          {
            id: "add",
            element: <CirclePlus className="w-4 h-4" />,
            onClick: showAddBehaviorModal,
            tooltip: "Add New Behavior",
          },
          {
            id: "help",
            element: <ShieldQuestion className="w-4 h-4" />,
            onClick: () => window.open("https://docs.dreamlab.gg/", "_blank"),
            tooltip: "View Behavior Docs",
          },
        ]}
      >
        {behaviors.map((behavior, index: number) => (
          <div key={index} className="mb-2">
            <p className="text-sm font-medium text-textPrimary">{behavior}</p>
            <div className="ml-2">
              {Object.keys(behaviorValues[behavior] || {}).map(key => (
                <InputField
                  type="text"
                  key={key}
                  label={key}
                  value={String(behaviorValues[behavior]![key]?.value)}
                  onChange={handleBehaviorValueChange(behavior, key)}
                />
              ))}
            </div>
          </div>
        ))}
      </Category>
    </div>
  );
};

const InspectorMemo = memo(Inspector);
export { InspectorMemo as Inspector };
