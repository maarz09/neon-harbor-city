// The story of Neon Harbor, all original: Rae Castellan comes home to Palmira Bay after three
// years inside and helps Marisol "Mari" Vega save her bar from developer and crime boss Lucien
// Brandt, with mechanic Dez Okafor fixing whatever needs fixing. Dialogue for each mission.

export const CAST = {
  rae: { name: 'Rae', color: '#ff7eb6' },
  mari: { name: 'Mari', color: '#7dffb0' },
  dez: { name: 'Dez', color: '#ffb02e' },
  brandt: { name: 'Lucien Brandt', color: '#9fb7ff' },
  radio: { name: 'Bay PD Radio', color: '#6aa8ff' },
};

export const INTRO_CARD = [
  'Palmira Bay. Sunshine, palm trees, and a skyline bought with somebody else\'s money.',
  'Rae Castellan is back after three years inside, and the only person who wrote every month is about to lose everything.',
];

export const DIALOGUE = {
  homecoming: [
    ['mari', 'Rae Castellan. Three years away and you still walk like you own the street.'],
    ['rae', 'Somebody has to. The bar looks good, Mari.'],
    ['mari', 'It\'s mortgaged to Lucien Brandt, and he wants it for another glass tower.'],
    ['mari', 'Dez is waiting at Okafor Kustoms. Take my coupe. Gently.'],
  ],
  homecomingDone: [
    ['dez', 'Mari\'s coupe, not a scratch? Prison made you careful.'],
    ['rae', 'Prison made me patient. Careful is new.'],
  ],
  borrowedShine: [
    ['dez', 'Brandt\'s nephew leaves a gold Corsair GT outside Brandt Tower like a trophy.'],
    ['rae', 'And you want the trophy.'],
    ['dez', 'I want what\'s hidden in the door panels. The alarm will scream: lose the cops before you bring it here.'],
  ],
  borrowedShineDone: [
    ['dez', 'Account books, tucked in the doors. Brandt\'s been paying somebody at City Hall.'],
    ['dez', 'Go see Mari. She\'ll know what they mean.'],
  ],
  paperTrail: [
    ['mari', 'Those books point to a ledger Brandt\'s crew keeps on a boat at Pelican Marina.'],
    ['mari', 'Three of his boys guard it. Take this pistol, and don\'t make me regret it.'],
    ['rae', 'You never regret me. You just worry.'],
  ],
  paperTrailDone: [
    ['mari', 'Names, dates, bribes. Enough to sink him, if we can hit his money too.'],
    ['brandt', 'Ms. Vega. I hear you have something of mine. Bring it back and the bar stays open.'],
    ['mari', 'He\'s scared. Good. Dez has work for you while I think.'],
  ],
  nightShift: [
    ['dez', 'Three packages of "auto parts" for clients who don\'t do daylight.'],
    ['dez', 'The clock is running the moment you take them. Any car will do. Don\'t get pulled over.'],
  ],
  nightShiftDone: [
    ['dez', 'Smooth. You drive like the bay owes you money.'],
    ['rae', 'It does.'],
  ],
  harborLights: [
    ['mari', 'Tonight Brandt moves the cash for the whole council through the Pier 9 warehouse.'],
    ['mari', 'We take it, the ledger goes to the papers, and he\'s finished.'],
    ['rae', 'And every cop in the bay comes after me.'],
    ['mari', 'So drive like you mean it. I\'ll be at the beach safehouse.'],
  ],
  harborLightsDone: [
    ['mari', 'It\'s on every channel. Brandt Holdings, raided at dawn.'],
    ['rae', 'And the bar?'],
    ['mari', 'Paid off. Free and clear. First round\'s on me, forever.'],
  ],
};

export const ENDING = [
  'Lucien Brandt\'s tower stands empty. The Salt & Lime keeps its lights on.',
  'Palmira Bay is still yours to explore: find every Golden Conch, outrun the Bay PD, and watch the sun go down over Coral Parade.',
];
