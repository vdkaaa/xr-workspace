import { glQuaternionToUnity, glVec3ToUnity } from "./xrMath";

// Shape expected by Assets/WebXR/Scripts/WebXRControllerData.cs (JsonUtility
// deserializes this directly, field names must match exactly).
export interface WebXRControllerButtonPayload {
  pressed: boolean;
  touched: boolean;
  value: number;
}

export interface WebXRControllerPayload {
  id: string;
  index: number;
  hand: string;
  buttons: WebXRControllerButtonPayload[];
  axes: number[];
  hasOrientation: boolean;
  hasPosition: boolean;
  orientation: [number, number, number, number];
  position: [number, number, number];
  linearAcceleration: [number, number, number];
  linearVelocity: [number, number, number];
}

function getGamepadButtons(gamepad: Gamepad): WebXRControllerButtonPayload[] {
  return Array.from(gamepad.buttons, (button) => ({
    pressed: button.pressed,
    touched: button.touched,
    value: button.value,
  }));
}

function getGamepadAxes(gamepad: Gamepad): number[] {
  return Array.from(gamepad.axes);
}

/** Reads every tracked, gamepad-backed input source in the frame (eg. Quest controllers). */
export function getGamepadsFromFrame(
  frame: XRFrame,
  refSpace: XRReferenceSpace
): WebXRControllerPayload[] {
  const controllers: WebXRControllerPayload[] = [];

  for (const source of frame.session.inputSources) {
    if (!source.gripSpace || !source.gamepad) continue;

    const sourcePose = frame.getPose(source.gripSpace, refSpace);
    if (!sourcePose) continue;

    const { position, orientation } = sourcePose.transform;

    controllers.push({
      id: source.gamepad.id,
      index: source.gamepad.index,
      hand: source.handedness,
      buttons: getGamepadButtons(source.gamepad),
      axes: getGamepadAxes(source.gamepad),
      hasOrientation: true,
      hasPosition: true,
      orientation: glQuaternionToUnity([orientation.x, orientation.y, orientation.z, orientation.w]),
      position: glVec3ToUnity([position.x, position.y, position.z]),
      linearAcceleration: [0, 0, 0],
      linearVelocity: [0, 0, 0],
    });
  }

  return controllers;
}
