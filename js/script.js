// Dumbledore's lines, how each tier is performed, and what each flagged
// expression actually means in ASL. Edit here to change the script.

// The one line that never changes.
export const NARRATION = "Dumbledore asked calmly.";

// How each tier is described in the reveal.
export const TIER_SAID = {
  1: "He asked <b>calmly</b>.",
  2: "He asked <b>firmly</b>.",
  3: "He asked <b>sharply</b>.",
  4: "He <b>shouted</b>.",
};

// One entry per question, all answerable with yes or no.
// `admits` is the answer the machine counts as an admission.
// Each tier holds one or more wordings; the randomizer picks among them, so repeat
// viewings differ while the tier stays earned.
// {name} is the name the Goblet announced, which may not be the one that was signed.
export const QUESTIONS = [
  {
    admits: "YES",
    tiers: {
      1: ["{name}. Did you put your name in the Goblet of Fire?"],
    },
  },
  {
    admits: "YES",
    tiers: {
      1: ["Did you ask an older student to put it in for you?",
          "Did someone older put it in on your behalf?"],
      2: ["Did you ask one of the older students to do it for you?",
          "Then did somebody else put it in for you?"],
      3: ["DID you ask an older student to do it? Did you?",
          "Somebody put it in for you. Did you ASK them to?"],
      4: ["DID YOU ASK AN OLDER STUDENT TO PUT IT IN FOR YOU?!"],
    },
  },
  {
    admits: "NO",
    tiers: {
      1: ["And you are quite sure of that?",
          "You are certain?"],
      2: ["You are absolutely sure of that?",
          "I will ask once more. You are sure?"],
      3: ["Are you SURE? Look at me. Are you sure?",
          "Look at me. Are you absolutely SURE?"],
      4: ["ARE YOU ABSOLUTELY SURE?!",
          "LOOK AT ME! ARE YOU SURE?!"],
    },
  },
  {
    admits: "NO",
    tiers: {
      1: ["Then are you telling me the Goblet is wrong?",
          "Then you are saying the Goblet made a mistake?"],
      2: ["Then you are telling me the Goblet of Fire is wrong?",
          "So the Goblet is mistaken. Is that what you are telling me?"],
      3: ["Are you telling me the Goblet is WRONG? Is that it?",
          "The Goblet does not make mistakes. Are you saying it DID?"],
      4: ["ARE YOU TELLING ME THE GOBLET IS WRONG?!",
          "THE GOBLET DOES NOT MAKE MISTAKES! ARE YOU SAYING IT DID?!"],
    },
  },
];

// Motion treatments per tier. The randomizer picks one each time.
export const REACTIONS = {
  1: ["settle", "drift"],
  2: ["lean", "press"],
  3: ["lurch", "pace", "jab"],
  4: ["charge", "slam", "roar"],
};

// What the machine flags on the face, how its emotion reader labels it,
// and what the same thing means in ASL.
export const MARKERS = {
  browsDown: {
    seen: "Lowered brows",
    machine: "angry",
    asl: "In ASL, lowered brows mark a wh-question: who, what, why, how. They work the way a question mark does.",
  },
  browsUp: {
    seen: "Raised brows",
    machine: "surprised",
    asl: "In ASL, raised brows mark a yes/no question or set up a topic. It is how you ask \u201cme?\u201d without a separate sign.",
  },
  headshake: {
    seen: "Head shake",
    machine: "angry",
    asl: "In ASL, a headshake negates the sentence. It is how you sign \u201cnot\u201d or \u201cdidn\u2019t\u201d, held for the whole phrase.",
  },
  mouth: {
    seen: "Mouth shape",
    machine: "sad",
    asl: "In ASL, mouth shapes work like adverbs and adjectives. A tight mouth, pursed lips or puffed cheeks change how big, how careful or how intense something is.",
  },
};

export const pick = list => list[Math.floor(Math.random() * list.length)];
