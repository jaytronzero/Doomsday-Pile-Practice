// Card definitions (SPEC §7). Pure data: no engine logic lives here, only the
// static facts the engine reads (types, cost, mana production, fetch types,
// cycling kind, …).
//
// `verified: true` only for the cards SPEC §7 marks *(verified)* (text checked
// against a web source on 2026-11-18). Every other `oracle` string is recalled
// from memory and may differ from the printed wording.

const COLORS5 = ['W', 'U', 'B', 'R', 'G'];

function mvOf(cost) {
  return Object.values(cost).reduce((a, b) => a + b, 0);
}

function def(name, o) {
  const cost = o.cost ?? {};
  return Object.freeze({
    name,
    types: Object.freeze(o.types ?? []),
    subtypes: Object.freeze(o.subtypes ?? []),
    supertypes: Object.freeze(o.supertypes ?? []),
    cost: Object.freeze({ ...cost }),
    mv: o.mv ?? mvOf(cost),
    supported: o.supported ?? true,
    verified: o.verified ?? false,
    oracle: o.oracle,
    // Engine data (all optional).
    produces: o.produces ? Object.freeze([...o.produces]) : undefined, // land {T} colors ('rX' = Cavern restricted)
    entersTapped: !!o.entersTapped,
    surveilOnEnter: !!o.surveilOnEnter,
    fetchTypes: o.fetchTypes ? Object.freeze([...o.fetchTypes]) : undefined,
    cycling: o.cycling ? Object.freeze({ ...o.cycling }) : undefined, // {kind:'life',n} | {kind:'sacLand'} | {kind:'mana',generic}
  });
}

const land = (name, o) => def(name, { types: ['land'], ...o });
const fetch = (name, a, b) => land(name, {
  fetchTypes: [a, b],
  oracle: `{T}, Pay 1 life, Sacrifice ${name}: Search your library for a${/^[AEIOU]/.test(a) ? 'n' : ''} ${a} or ${b} card, put it onto the battlefield, then shuffle.`,
});

const LIST = [
  // ---- Lands -------------------------------------------------------------
  land('Island', {
    supertypes: ['basic'], subtypes: ['Island'], produces: ['U'],
    oracle: '({T}: Add {U}.)',
  }),
  land('Swamp', {
    supertypes: ['basic'], subtypes: ['Swamp'], produces: ['B'],
    oracle: '({T}: Add {B}.)',
  }),
  land('Underground Sea', {
    subtypes: ['Island', 'Swamp'], produces: ['U', 'B'],
    oracle: '({T}: Add {U} or {B}.)',
  }),
  land('Undercity Sewers', {
    subtypes: ['Island', 'Swamp'], produces: ['U', 'B'], entersTapped: true, surveilOnEnter: true, verified: true,
    oracle: '({T}: Add {U} or {B}.)\nThis land enters tapped.\nWhen this land enters, surveil 1. '
      + '(Look at the top card of your library. You may put it into your graveyard.)',
  }),
  land('Cavern of Souls', {
    produces: ['C', 'rW', 'rU', 'rB', 'rR', 'rG'],
    oracle: 'As Cavern of Souls enters, choose a creature type.\n{T}: Add {C}.\n'
      + "{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.",
  }),
  fetch('Polluted Delta', 'Island', 'Swamp'),
  fetch('Flooded Strand', 'Plains', 'Island'),
  fetch('Bloodstained Mire', 'Swamp', 'Mountain'),
  fetch('Misty Rainforest', 'Forest', 'Island'),
  fetch('Scalding Tarn', 'Island', 'Mountain'),
  fetch('Verdant Catacombs', 'Swamp', 'Forest'),

  // ---- Mana artifacts ----------------------------------------------------
  def('Lotus Petal', {
    types: ['artifact'], cost: {},
    oracle: '{T}, Sacrifice Lotus Petal: Add one mana of any color.',
  }),
  def("Lion's Eye Diamond", {
    types: ['artifact'], cost: {},
    oracle: "Discard your hand, Sacrifice Lion's Eye Diamond: Add three mana of any one color. Activate only as an instant.",
  }),

  // ---- Spells ------------------------------------------------------------
  def("Thassa's Oracle", {
    types: ['creature'], subtypes: ['Merfolk', 'Wizard'], cost: { U: 2 }, verified: true,
    oracle: "When Thassa's Oracle enters, look at the top X cards of your library, where X is your devotion to blue. "
      + 'Put up to one of them on top of your library and the rest on the bottom of your library in a random order. '
      + 'If X is greater than or equal to the number of cards in your library, you win the game. '
      + '(Each {U} in the mana costs of permanents you control counts toward your devotion to blue.)',
  }),
  def('Street Wraith', {
    types: ['creature'], subtypes: ['Wraith'], cost: { B: 2, generic: 3 }, cycling: { kind: 'life', n: 2 },
    oracle: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)",
  }),
  def('Edge of Autumn', {
    types: ['sorcery'], cost: { G: 1, generic: 1 }, cycling: { kind: 'sacLand' }, verified: true,
    oracle: 'If you control four or fewer lands, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n'
      + 'Cycling—Sacrifice a land. (Sacrifice a land, Discard this card: Draw a card.)',
  }),
  def('Dark Ritual', {
    types: ['instant'], cost: { B: 1 },
    oracle: 'Add {B}{B}{B}.',
  }),
  def('Brainstorm', {
    types: ['instant'], cost: { U: 1 },
    oracle: 'Draw three cards, then put two cards from your hand on top of your library in any order.',
  }),
  def('Ponder', {
    types: ['sorcery'], cost: { U: 1 },
    oracle: 'Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.',
  }),
  def('Consider', {
    types: ['instant'], cost: { U: 1 },
    oracle: 'Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\nDraw a card.',
  }),
  def('Personal Tutor', {
    types: ['sorcery'], cost: { U: 1 }, verified: true,
    oracle: 'Search your library for a sorcery card, reveal it, then shuffle and put that card on top.',
  }),
  def('Flow State', {
    types: ['sorcery'], cost: { U: 1, generic: 1 }, verified: true,
    oracle: 'Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. '
      + 'If there is an instant card and a sorcery card in your graveyard, instead put two of those cards into your hand and the rest on the bottom of your library in any order.',
  }),
  def('Unearth', {
    types: ['sorcery'], cost: { B: 1 }, cycling: { kind: 'mana', generic: 2 },
    oracle: 'Return target creature card with mana value 3 or less from your graveyard to the battlefield.\nCycling {2} ({2}, Discard this card: Draw a card.)',
  }),
  def('Duress', {
    types: ['sorcery'], cost: { B: 1 },
    oracle: 'Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.',
  }),
  def('Thoughtseize', {
    types: ['sorcery'], cost: { B: 1 },
    oracle: 'Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.',
  }),
  def('Fatal Push', {
    types: ['instant'], cost: { B: 1 },
    oracle: 'Destroy target creature if it has mana value 2 or less.\nRevolt — Destroy that creature if it has mana value 4 or less instead if a permanent you controlled left the battlefield this turn.',
  }),

  // ---- Dead in v1 (types kept so type checks still see them) -----------------
  def('Doomsday', {
    types: ['sorcery'], cost: { B: 3 }, supported: false,
    oracle: 'Search your library and graveyard for five cards and exile the rest. Put the chosen cards on top of your library in any order. You lose half your life, rounded up.',
  }),
  def('Daze', {
    types: ['instant'], cost: { U: 1, generic: 1 }, supported: false,
    oracle: 'You may return an Island you control to its owner\'s hand rather than pay this spell\'s mana cost.\nCounter target spell unless its controller pays {1}.',
  }),
  def('Force of Will', {
    types: ['instant'], cost: { U: 2, generic: 3 }, supported: false,
    oracle: 'You may pay 1 life and exile a blue card from your hand rather than pay this spell\'s mana cost.\nCounter target spell.',
  }),
  def('Force of Negation', {
    types: ['instant'], cost: { U: 2, generic: 1 }, supported: false,
    oracle: "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost.\n"
      + 'Counter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner\'s graveyard.',
  }),
  def('Flusterstorm', {
    types: ['instant'], cost: { U: 1 }, supported: false,
    oracle: 'Counter target instant or sorcery spell unless its controller pays {1}.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)',
  }),
  def('Barrowgoyf', {
    types: ['creature'], subtypes: ['Lhurgoyf'], cost: { B: 1, generic: 2 }, supported: false,
    oracle: "Deathtouch, lifelink\nBarrowgoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.\n"
      + 'Whenever Barrowgoyf deals combat damage to a player, you may mill that many cards. If you do, you may put a creature card from among them into your hand.',
  }),
  def('Jace, Wielder of Mysteries', {
    types: ['planeswalker'], subtypes: ['Jace'], supertypes: ['legendary'], cost: { U: 2, generic: 3 }, supported: false,
    oracle: "If you would draw a card while your library has no cards in it, you win the game instead.\n+1: Target player mills two cards. Draw a card.\n−8: Draw seven cards. Then if your library has no cards in it, you win the game.",
  }),
  def('Leyline of the Void', {
    types: ['enchantment'], cost: { B: 2, generic: 2 }, supported: false,
    oracle: "If Leyline of the Void is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead.",
  }),
  def('Voice of Victory', {
    types: ['creature'], subtypes: ['Human', 'Bard'], cost: { W: 1, generic: 1 }, supported: false,
    oracle: "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nYour opponents can't cast spells during your turn.",
  }),
];

export const CARDS = Object.freeze(Object.fromEntries(LIST.map((d) => [d.name, d])));

const BY_NAME = new Map(LIST.map((d) => [d.name, d]));

/** Card definition by name; unknown names get a dead def with no known types. */
export function cardDef(name) {
  const d = BY_NAME.get(name);
  if (d) return d;
  return def(String(name), { types: [], cost: {}, mv: 0, supported: false, oracle: '(unknown card: not modelled)' });
}

export const MANA_COLORS = Object.freeze(['W', 'U', 'B', 'R', 'G', 'C']);
export const RESTRICTED_COLORS = Object.freeze(COLORS5);
