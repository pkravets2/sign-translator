# GBDA 414, Group 4: The Goblet of Fire

A webcam piece where a machine questions you and you answer in sign language. It reads your hands and face, then decides whether it believes you.

**Try it:** https://pkravets2.github.io/sign-translator/

## How to use it

1. Open the link in Chrome or Edge, press **Start** and allow the camera.
2. Spell your name by copying the hand shapes on screen. Hold each letter still.
3. Answer four questions by spelling YES or NO. Shake your head for no and nod for yes.
4. See the machine's verdict, then what really happened.

**How it works** in the top bar explains it again at any time. **Practice** shows the letters up close.

## Run it on your own computer

Install [Node.js](https://nodejs.org), then:

```bash
node serve.js
```

Open http://localhost:8771 in Chrome or Edge.

## Credits

- Hand and face tracking: Google MediaPipe.
- Hand-sign drawings: public domain, from wpclipart via [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:ASL_letters).
- Letter recognition trained on two Kaggle datasets: [asl-alphabet](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) and [asl-dataset](https://www.kaggle.com/datasets/ayuraj/asl-dataset).
- A student project, not affiliated with Harry Potter.
