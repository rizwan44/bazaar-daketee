export type GameCategory =
  | 'traditional'
  | 'rummy'
  | 'poker'
  | 'casino'
  | 'trick-taking'
  | 'shedding'
  | 'matching'
  | 'solitaire'
  | 'speed';

export interface GameCatalogModeVariant {
  key: string;
  label: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameCatalogEntry {
  /** Slug used as DB key, route param, and folder name under games/<key> once implemented. */
  key: string;
  name: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  /** Can be played solo against AI opponents. */
  isSolo: boolean;
  /** Flips to true once the game's rule module + UI ship. Drives "Coming Soon" badges. */
  isImplemented: boolean;
  description: string;
  /** Present only for games with more than one player-count/team variant (e.g. 4 Card). When present, room creation must offer this choice instead of using the top-level minPlayers/maxPlayers directly. */
  modes?: GameCatalogModeVariant[];
}

/**
 * Single source of truth for all 52 games — seeds the `games` DB table and
 * drives the Games list UI. Rule modules land per-game starting Phase 5;
 * until then every entry here is metadata only.
 */
export const GAME_CATALOG: GameCatalogEntry[] = [
  { key: 'teen-patti', name: 'Teen Patti', category: 'traditional', minPlayers: 3, maxPlayers: 6, isSolo: true, isImplemented: true, description: 'Classic South Asian three-card betting game.' },
  { key: 'andar-bahar', name: 'Andar Bahar', category: 'traditional', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Fast-paced Indian card game of chance.' },
  { key: 'rummy', name: 'Rummy', category: 'rummy', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Form sets and sequences to go out first.' },
  { key: 'gin-rummy', name: 'Gin Rummy', category: 'rummy', minPlayers: 2, maxPlayers: 2, isSolo: true, isImplemented: false, description: 'Two-player rummy variant with knocking.' },
  { key: 'indian-rummy', name: 'Indian Rummy', category: 'rummy', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: '13-card rummy with two decks and jokers.' },
  { key: 'poker', name: 'Poker', category: 'poker', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Classic five-card draw poker.' },
  { key: 'texas-holdem', name: "Texas Hold'em", category: 'poker', minPlayers: 2, maxPlayers: 9, isSolo: true, isImplemented: false, description: "The world's most popular poker variant." },
  { key: 'omaha', name: 'Omaha', category: 'poker', minPlayers: 2, maxPlayers: 9, isSolo: true, isImplemented: false, description: 'Four-hole-card poker variant.' },
  { key: 'blackjack', name: 'Blackjack', category: 'casino', minPlayers: 1, maxPlayers: 7, isSolo: true, isImplemented: false, description: 'Beat the dealer without going over 21.' },
  { key: 'baccarat', name: 'Baccarat', category: 'casino', minPlayers: 1, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Bet on Player, Banker, or Tie.' },
  { key: 'war', name: 'War', category: 'traditional', minPlayers: 2, maxPlayers: 2, isSolo: true, isImplemented: false, description: 'Simple highest-card-wins duel.' },
  { key: 'crazy-eights', name: 'Crazy Eights', category: 'shedding', minPlayers: 2, maxPlayers: 7, isSolo: true, isImplemented: false, description: 'Match suit or rank, eights are wild.' },
  { key: 'go-fish', name: 'Go Fish', category: 'matching', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Collect sets by asking opponents for cards.' },
  { key: 'old-maid', name: 'Old Maid', category: 'matching', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: "Pair up cards, avoid holding the odd one out." },
  { key: 'hearts', name: 'Hearts', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Avoid taking hearts and the queen of spades.' },
  { key: 'spades', name: 'Spades', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Bid and win tricks with spades as trump.' },
  { key: 'call-break', name: 'Call Break', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Popular South Asian bidding trick-taker.' },
  { key: 'bridge', name: 'Bridge', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Partnership bidding and trick-taking classic.' },
  { key: 'whist', name: 'Whist', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Traditional partnership trick-taking game.' },
  { key: 'oh-hell', name: 'Oh Hell', category: 'trick-taking', minPlayers: 3, maxPlayers: 7, isSolo: true, isImplemented: false, description: 'Bid the exact number of tricks you will win.' },
  { key: 'euchre', name: 'Euchre', category: 'trick-taking', minPlayers: 4, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Fast trick-taking game with a 24-card deck.' },
  { key: 'pinochle', name: 'Pinochle', category: 'trick-taking', minPlayers: 2, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Melding and trick-taking with a double deck.' },
  { key: 'five-hundred', name: '500', category: 'trick-taking', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Bidding trick-taker derived from Euchre.' },
  { key: 'durak', name: 'Durak', category: 'shedding', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Russian attack-and-defend shedding game.' },
  { key: 'president', name: 'President', category: 'shedding', minPlayers: 3, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Climb ranks by shedding cards first.' },
  { key: 'palace', name: 'Palace', category: 'shedding', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Shedding game with hidden and face-up cards.' },
  { key: 'sevens', name: 'Sevens', category: 'matching', minPlayers: 3, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Build suit sequences outward from each seven.' },
  { key: 'golf', name: 'Golf', category: 'matching', minPlayers: 2, maxPlayers: 6, isSolo: true, isImplemented: false, description: 'Lowest score wins by swapping grid cards.' },
  { key: 'klondike-solitaire', name: 'Klondike Solitaire', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'The classic single-player solitaire.' },
  { key: 'spider-solitaire', name: 'Spider Solitaire', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Build same-suit runs across ten columns.' },
  { key: 'freecell', name: 'FreeCell', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Nearly every deal is winnable with the right plan.' },
  { key: 'pyramid', name: 'Pyramid', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Pair cards that sum to 13 to clear the pyramid.' },
  { key: 'tripeaks', name: 'TriPeaks', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Clear three peaks with sequential card runs.' },
  { key: 'yukon', name: 'Yukon', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Klondike variant with no stock pile.' },
  { key: 'canfield', name: 'Canfield', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Casino-style solitaire starting from a reserve.' },
  { key: 'forty-thieves', name: 'Forty Thieves', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Two-deck solitaire with tight tableau rules.' },
  { key: 'scorpion', name: 'Scorpion', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Build full-suit sequences with free movement.' },
  { key: 'accordion', name: 'Accordion', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Compress the entire deck into a single pile.' },
  { key: 'clock-solitaire', name: 'Clock Solitaire', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'A game of pure chance around a card clock face.' },
  { key: 'aces-up', name: 'Aces Up', category: 'solitaire', minPlayers: 1, maxPlayers: 1, isSolo: true, isImplemented: false, description: 'Discard down to just the four aces.' },
  { key: 'beggar-my-neighbour', name: 'Beggar-My-Neighbour', category: 'matching', minPlayers: 2, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Simple no-skill card battle for kids.' },
  { key: 'egyptian-ratscrew', name: 'Egyptian Ratscrew', category: 'speed', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Slap the pile on doubles and sandwiches.' },
  { key: 'slapjack', name: 'Slapjack', category: 'speed', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Slap the pile the instant a Jack appears.' },
  { key: 'spoons', name: 'Spoons', category: 'speed', minPlayers: 3, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Collect four of a kind, then grab a spoon.' },
  { key: 'snap', name: 'Snap', category: 'speed', minPlayers: 2, maxPlayers: 8, isSolo: true, isImplemented: false, description: 'Call Snap when matching cards appear.' },
  { key: 'speed', name: 'Speed', category: 'speed', minPlayers: 2, maxPlayers: 2, isSolo: true, isImplemented: false, description: 'Real-time race to empty your hand first.' },
  { key: 'spit', name: 'Spit', category: 'speed', minPlayers: 2, maxPlayers: 2, isSolo: true, isImplemented: false, description: 'Simultaneous fast-paced sequence building.' },
  { key: 'shithead', name: 'Shithead', category: 'shedding', minPlayers: 2, maxPlayers: 5, isSolo: true, isImplemented: false, description: 'Shed all your cards using hidden and face-up piles.' },
  { key: 'scopa', name: 'Scopa', category: 'casino', minPlayers: 2, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Italian fishing-style card capture game.' },
  { key: 'cassino', name: 'Cassino', category: 'casino', minPlayers: 2, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Capture table cards by pairing or building.' },
  { key: 'cribbage', name: 'Cribbage', category: 'traditional', minPlayers: 2, maxPlayers: 4, isSolo: true, isImplemented: false, description: 'Peg your way to 121 points first.' },
  { key: 'german-whist', name: 'German Whist', category: 'trick-taking', minPlayers: 2, maxPlayers: 2, isSolo: true, isImplemented: false, description: 'Two-player trick-taking with a changing trump.' },
  {
    key: 'four-card',
    name: 'Bazaar Daketee',
    category: 'traditional',
    minPlayers: 2,
    maxPlayers: 4,
    isSolo: true,
    isImplemented: true,
    description: 'Pakistani local capture-and-lock game — match ranks to build stacks and complete locks.',
    modes: [
      { key: 'two-player', label: '2 Players', minPlayers: 2, maxPlayers: 2 },
      { key: 'four-individual', label: '4 Players — Individual', minPlayers: 4, maxPlayers: 4 },
      { key: 'four-team', label: '4 Players — Team (2v2)', minPlayers: 4, maxPlayers: 4 },
    ],
  },
];

export function getGameByKey(key: string): GameCatalogEntry | undefined {
  return GAME_CATALOG.find((game) => game.key === key);
}
