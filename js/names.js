// The Goblet's name bank and its autocorrect rule.
//
// Names are listed roughly from most to least common in English-language records,
// so position in the list is the machine's idea of "familiar". A name in the bank
// comes back unchanged. Anything else is overwritten with the closest bank name,
// with ties going to the more common one. The Goblet never asks.

const FIRST = `JAMES MARY MICHAEL PATRICIA JOHN JENNIFER ROBERT LINDA DAVID ELIZABETH WILLIAM BARBARA
RICHARD SUSAN JOSEPH JESSICA THOMAS KAREN CHRISTOPHER SARAH CHARLES LISA DANIEL NANCY MATTHEW SANDRA
ANTHONY BETTY MARK ASHLEY DONALD EMILY STEVEN KIMBERLY ANDREW MARGARET PAUL DONNA JOSHUA MICHELLE
KENNETH CAROL KEVIN AMANDA BRIAN MELISSA TIMOTHY DEBORAH RONALD STEPHANIE GEORGE REBECCA JASON SHARON
EDWARD LAURA JEFFREY CYNTHIA RYAN DOROTHY JACOB AMY NICHOLAS KATHLEEN GARY ANGELA ERIC SHIRLEY
JONATHAN EMMA STEPHEN BRENDA LARRY PAMELA JUSTIN NICOLE SCOTT ANNA BRANDON SAMANTHA BENJAMIN KATHERINE
SAMUEL CHRISTINE GREGORY DEBRA ALEXANDER RACHEL PATRICK CAROLYN FRANK JANET RAYMOND MARIA JACK OLIVIA
DENNIS HEATHER JERRY HELEN TYLER CATHERINE AARON DIANE JOSE JULIE ADAM VICTORIA NATHAN JOYCE HENRY
LAUREN ZACHARY KELLY DOUGLAS CHRISTINA PETER RUTH KYLE JOAN NOAH VIRGINIA ETHAN JUDITH JEREMY EVELYN
CHRISTIAN HANNAH WALTER ANDREA KEITH MEGAN AUSTIN CHERYL ROGER JACQUELINE TERRY MADISON SEAN TERESA
GERALD ABIGAIL CARL SOPHIA DYLAN MARTHA HAROLD SARA JORDAN GLORIA JESSE JANICE BRYAN KATHRYN LAWRENCE
ANN ARTHUR ISABELLA GABRIEL JUDY BRUCE CHARLOTTE LOGAN JULIA BILLY GRACE JOE AMBER ALAN ALICE JUAN JEAN
ELIJAH DENISE WILLIE FRANCES ALBERT DANIELLE WAYNE MARILYN RANDY NATALIE MASON BEVERLY VINCENT DIANA
LIAM BRITTANY ROY THERESA BOBBY KAYLA CALEB ALEXIS BRADLEY DORIS RUSSELL LORI LUCAS TIFFANY
HARRY RON HERMIONE CEDRIC VIKTOR FLEUR ALBUS SEVERUS DRACO NEVILLE GINNY LUNA MINERVA SIRIUS REMUS
TOM TIM JIM BOB BILL MIKE DAVE DAN SAM BEN MAX LEO EVA MIA AVA ZOE LUCY LILY ELLA CHLOE SOPHIE KATE JANE
ROSE CLAIRE ERIN LUKE OWEN ISAAC OLIVER CONNOR EVAN IAN COLIN NEIL PHILIP SIMON MARTIN ALEX CHRIS NICK
MATT STEVE TONY FRED ALFRED OSCAR HUGO FELIX LEE RAY JAY KIM SUE PAT DEAN SETH COLE ADA IVY MAY JOY
MOLLY PERCY ARTHUR IGOR CHO`.split(/\s+/);

const LAST = `POTTER WEASLEY GRANGER DIGGORY KRUM DELACOUR DUMBLEDORE MALFOY SMITH JOHNSON WILLIAMS BROWN
JONES MILLER DAVIS WILSON ANDERSON TAYLOR MOORE JACKSON THOMPSON WHITE HARRIS CLARK LEWIS ROBINSON WALKER
YOUNG ALLEN KING WRIGHT HILL GREEN ADAMS BAKER NELSON CARTER MITCHELL ROBERTS TURNER PHILLIPS CAMPBELL
PARKER EVANS EDWARDS COLLINS STEWART MORRIS MURPHY COOK ROGERS MORGAN COOPER REED BAILEY BELL HOWARD WARD
WOOD WATSON BROOKS BENNETT GRAY HUGHES PRICE FOSTER`.split(/\s+/);

const BANK = [...new Set([...FIRST, ...LAST])];
const RANK = new Map(BANK.map((n, i) => [n, i]));

// Optimal string alignment distance (Levenshtein plus adjacent swaps).
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function correctWord(word) {
  if (RANK.has(word)) return { name: word, changed: false, edits: 0 };
  let best = null;
  for (const name of BANK) {
    const edits = distance(word, name);
    const score = edits / Math.max(word.length, name.length)
      + (name[0] === word[0] ? 0 : 0.15)          // keeps the first letter when it can
      + 0.12 * (RANK.get(name) / BANK.length);    // leans toward the more common name
    if (!best || score < best.score) best = { name, score, edits };
  }
  return { name: best.name, changed: true, edits: best.edits };
}

export function autocorrect(input) {
  const words = input.toUpperCase().replace(/[^A-Z ]/g, "").trim().split(/\s+/).filter(Boolean);
  const out = words.map(correctWord);
  const edits = out.reduce((n, w) => n + w.edits, 0);
  return {
    signed: words.join(" "),
    name: out.map(w => w.name).join(" "),
    changed: out.some(w => w.changed),
    // The Goblet is always sure of itself; a heavier rewrite barely dents the number.
    confidence: Math.max(0.91, 0.994 - 0.011 * edits),
  };
}

export const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
