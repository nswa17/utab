import { StyleModel } from '../models/style.js'

export const stylesSeed = [
  {
    id: 1,
    name: 'Academic',
    side_labels: { gov: 'Affirmative', opp: 'Negative' },
    side_labels_short: { gov: 'Aff', opp: 'Neg' },
    score_weights: [
      { order: 1, value: 1 },
      { order: 2, value: 1 },
      { order: 3, value: 1 },
      { order: 4, value: 1 },
    ],
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
      { order: 3, value: 'gov-2' },
      { order: 4, value: 'opp-2' },
      { order: 5, value: 'gov-3' },
      { order: 6, value: 'opp-3' },
      { order: 7, value: 'opp-4' },
      { order: 8, value: 'gov-4' },
    ],
    range: [
      { order: 1, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 2, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 3, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 4, value: { from: 1, to: 10, unit: 1, default: 5 } },
    ],
    adjudicator_range: { from: 1, to: 10, default: 5, unit: 1 },
    roles: {
      gov: [
        { order: 1, long: 'Constructive', abbr: 'Const' },
        { order: 2, long: 'Attack', abbr: 'Attack' },
        { order: 3, long: 'Defense', abbr: 'Defense' },
        { order: 4, long: 'Summary', abbr: 'Summary' },
      ],
      opp: [
        { order: 1, long: 'Constructive', abbr: 'Const' },
        { order: 2, long: 'Attack', abbr: 'Attack' },
        { order: 3, long: 'Defense', abbr: 'Defense' },
        { order: 4, long: 'Summary', abbr: 'Summary' },
      ],
    },
  },
  {
    id: 2,
    name: 'North American',
    side_labels: { gov: 'Government', opp: 'Opposition' },
    side_labels_short: { gov: 'Gov', opp: 'Opp' },
    score_weights: [
      { order: 1, value: 1 },
      { order: 2, value: 1 },
      { order: 3, value: 0.5 },
    ],
    range: [
      { order: 1, value: { from: 60, to: 90, unit: 1, default: 75 } },
      { order: 2, value: { from: 60, to: 90, unit: 1, default: 75 } },
      { order: 3, value: { from: 30, to: 45, unit: 0.5, default: 37.5 } },
    ],
    adjudicator_range: { from: 1, to: 10, default: 5, unit: 1 },
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
      { order: 3, value: 'gov-2' },
      { order: 4, value: 'opp-2' },
      { order: 5, value: 'opp-3' },
      { order: 6, value: 'gov-3' },
    ],
    roles: {
      gov: [
        { order: 1, long: 'Prime Minister', abbr: 'PM' },
        { order: 2, long: 'Member of Government', abbr: 'MG' },
        { order: 3, long: 'Government Reply', abbr: 'GR' },
      ],
      opp: [
        { order: 1, long: 'Leader of Opposition', abbr: 'LO' },
        { order: 2, long: 'Member of Opposition', abbr: 'MO' },
        { order: 3, long: 'Opposition Reply', abbr: 'OR' },
      ],
    },
  },
  {
    id: 4,
    name: 'PDA3',
    side_labels: { gov: 'Government', opp: 'Opposition' },
    side_labels_short: { gov: 'Gov', opp: 'Opp' },
    score_weights: [
      { order: 1, value: 1 },
      { order: 2, value: 1 },
      { order: 3, value: 1 },
    ],
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
      { order: 3, value: 'gov-2' },
      { order: 4, value: 'opp-2' },
      { order: 5, value: 'opp-3' },
      { order: 6, value: 'gov-3' },
    ],
    range: [
      { order: 1, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 2, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 3, value: { from: 1, to: 10, unit: 1, default: 5 } },
    ],
    adjudicator_range: { from: 1, to: 5, default: 3, unit: 1 },
    roles: {
      gov: [
        { order: 1, long: 'Prime Minister', abbr: 'PM' },
        { order: 2, long: 'Member of Government', abbr: 'MG' },
        { order: 3, long: 'Government Reply', abbr: 'GR' },
      ],
      opp: [
        { order: 1, long: 'Leader of Opposition', abbr: 'LO' },
        { order: 2, long: 'Member of Opposition', abbr: 'MO' },
        { order: 3, long: 'Opposition Reply', abbr: 'OR' },
      ],
    },
  },
  {
    id: 5,
    name: 'PDA4',
    side_labels: { gov: 'Government', opp: 'Opposition' },
    side_labels_short: { gov: 'Gov', opp: 'Opp' },
    score_weights: [
      { order: 1, value: 1 },
      { order: 2, value: 1 },
      { order: 3, value: 1 },
      { order: 4, value: 1 },
    ],
    range: [
      { order: 1, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 2, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 3, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 4, value: { from: 1, to: 10, unit: 1, default: 5 } },
    ],
    adjudicator_range: { from: 1, to: 5, default: 3, unit: 1 },
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
      { order: 3, value: 'gov-2' },
      { order: 4, value: 'gov-3' },
      { order: 5, value: 'opp-2' },
      { order: 6, value: 'opp-3' },
      { order: 7, value: 'opp-4' },
      { order: 8, value: 'gov-4' },
    ],
    roles: {
      gov: [
        { order: 1, long: 'Prime Minister', abbr: 'PM' },
        { order: 2, long: 'Member of Government1', abbr: 'MG1' },
        { order: 3, long: 'Member of Government2', abbr: 'MG2' },
        { order: 4, long: 'Government Reply', abbr: 'GR' },
      ],
      opp: [
        { order: 1, long: 'Leader of Opposition', abbr: 'LO' },
        { order: 2, long: 'Member of Opposition1', abbr: 'MO1' },
        { order: 3, long: 'Member of Opposition2', abbr: 'MO2' },
        { order: 4, long: 'Opposition Reply', abbr: 'OR' },
      ],
    },
  },
  {
    id: 6,
    name: 'Asian',
    side_labels: { gov: 'Government', opp: 'Opponents' },
    side_labels_short: { gov: 'Gov', opp: 'Opp' },
    score_weights: [
      { order: 1, value: 1 },
      { order: 2, value: 1 },
      { order: 3, value: 1 },
      { order: 4, value: 0.5 },
    ],
    range: [
      { order: 1, value: { from: 60, to: 90, unit: 1, default: 75 } },
      { order: 2, value: { from: 60, to: 90, unit: 1, default: 75 } },
      { order: 3, value: { from: 60, to: 90, unit: 1, default: 75 } },
      { order: 4, value: { from: 30, to: 45, unit: 0.5, default: 37.5 } },
    ],
    adjudicator_range: { from: 1, to: 10, default: 5, unit: 1 },
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
      { order: 3, value: 'gov-2' },
      { order: 4, value: 'opp-2' },
      { order: 5, value: 'gov-3' },
      { order: 6, value: 'opp-3' },
      { order: 7, value: 'opp-4' },
      { order: 8, value: 'gov-4' },
    ],
    roles: {
      gov: [
        { order: 1, long: 'Prime Minister', abbr: 'PM' },
        { order: 2, long: 'Member of Government', abbr: 'MG' },
        { order: 3, long: 'Whip', abbr: 'Whip' },
        { order: 4, long: 'Government Reply', abbr: 'GR' },
      ],
      opp: [
        { order: 1, long: 'Leader of Opposition', abbr: 'LO' },
        { order: 2, long: 'Member of Opposition', abbr: 'MO' },
        { order: 3, long: 'Whip', abbr: 'Whip' },
        { order: 4, long: 'Opposition Reply', abbr: 'OR' },
      ],
    },
  },
  {
    id: 7,
    name: '1vs1',
    side_labels: { gov: 'Affirmative', opp: 'Negative' },
    side_labels_short: { gov: 'Aff', opp: 'Neg' },
    score_weights: [{ order: 1, value: 1 }],
    range: [{ order: 1, value: { from: 60, to: 90, unit: 1, default: 75 } }],
    adjudicator_range: { from: 1, to: 10, default: 5, unit: 1 },
    speaker_sequence: [
      { order: 1, value: 'gov-1' },
      { order: 2, value: 'opp-1' },
    ],
    roles: {
      gov: [{ order: 1, long: 'Constructive', abbr: 'Const' }],
      opp: [{ order: 1, long: 'Constructive', abbr: 'Const' }],
    },
  },
]

export async function seedStyles(): Promise<void> {
  for (const style of stylesSeed) {
    await StyleModel.updateOne({ id: style.id }, { $setOnInsert: style }, { upsert: true })
  }
}
