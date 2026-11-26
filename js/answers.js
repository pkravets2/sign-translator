// How the machine reads an answer. It only knows two: yes and no.
//
// Anything it does not recognise is forced into whichever is closer, the same way
// the Goblet treats names. A tie goes to YES, because the machine expects a confession.
// An empty answer (including an answer given in signs, which it cannot read) stays empty.

const YES = ["YES", "YEAH", "YEP", "YES SIR", "I DID", "I DO", "SURE", "TRUE", "RIGHT", "ME", "I AM"];
const NO = ["NO", "NOT", "NOPE", "NAH", "NEVER", "NO SIR", "NOT ME", "I DID NOT", "DID NOT", "I DIDNT", "FALSE", "WRONG"];

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const closest = (text, bank) =>
  Math.min(...bank.map(word => distance(text, word) / Math.max(text.length, word.length)));

export function readAnswer(text) {
  const answer = text.toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
  if (!answer) return { read: null, changed: false };
  const yes = closest(answer, YES), no = closest(answer, NO);
  const read = no < yes ? "NO" : "YES";
  return { read, changed: answer !== read };
}
