/** Builds a `Gamepad`-shaped object with the standard layout's 4 axes and 17 buttons. */
export function fakePad(
  overrides: {
    axes?: number[];
    buttons?: number[];
    connected?: boolean;
    index?: number;
    mapping?: GamepadMappingType;
  } = {},
): Gamepad {
  const axes = [0, 0, 0, 0];
  for (const [i, value] of (overrides.axes ?? []).entries()) axes[i] = value;
  const values: number[] = Array(17).fill(0);
  for (const [i, value] of (overrides.buttons ?? []).entries()) values[i] = value;
  return {
    id: 'fake pad',
    index: overrides.index ?? 0,
    connected: overrides.connected ?? true,
    mapping: overrides.mapping ?? 'standard',
    timestamp: 0,
    axes,
    buttons: values.map((value) => ({ pressed: value >= 0.5, touched: value > 0, value })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

/** Standard-layout button array with the given indices fully pressed. */
export function pressed(...indices: number[]): number[] {
  const buttons: number[] = Array(17).fill(0);
  for (const index of indices) buttons[index] = 1;
  return buttons;
}
