/** Per-tick input snapshot, digital like the cabinet's two 2-way sticks. */
export interface InputState {
  /** Left tread stick: -1 back, 0 neutral, +1 forward. */
  leftTread: -1 | 0 | 1;
  /** Right tread stick: -1 back, 0 neutral, +1 forward. */
  rightTread: -1 | 0 | 1;
  /** Fire button held. */
  fire: boolean;
  /** Fire pressed this tick (edge). */
  firePressed: boolean;
  /** Start (1-player) pressed this tick (edge). */
  startPressed: boolean;
  /** Any input activity this tick, used to wake attract mode. */
  anyActivity: boolean;
}

export const NEUTRAL_INPUT: InputState = Object.freeze({
  leftTread: 0,
  rightTread: 0,
  fire: false,
  firePressed: false,
  startPressed: false,
  anyActivity: false,
});
